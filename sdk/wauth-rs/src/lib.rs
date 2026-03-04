use std::collections::HashSet;
use std::collections::HashMap;

use jsonschema::{Draft, JSONSchema};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{
    decode, decode_header as jwt_decode_header, get_current_timestamp, Algorithm, DecodingKey,
    Validation,
};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn canonicalize_jcs(value: &Value) -> Result<String, String> {
    match value {
        Value::Null => Ok("null".to_string()),
        Value::Bool(v) => Ok(if *v { "true" } else { "false" }.to_string()),
        Value::Number(n) => {
            if let Some(v) = n.as_i64() {
                Ok(v.to_string())
            } else if let Some(v) = n.as_u64() {
                Ok(v.to_string())
            } else if let Some(v) = n.as_f64() {
                if !v.is_finite() {
                    return Err("JCS does not allow non-finite numbers".to_string());
                }
                if v == 0.0 {
                    return Ok("0".to_string());
                }
                let mut buf = ryu::Buffer::new();
                Ok(buf.format_finite(v).to_string())
            } else {
                Err("unsupported number representation".to_string())
            }
        }
        Value::String(s) => serde_json::to_string(s).map_err(|e| e.to_string()),
        Value::Array(arr) => {
            let mut out = String::from("[");
            for (idx, entry) in arr.iter().enumerate() {
                if idx > 0 {
                    out.push(',');
                }
                out.push_str(&canonicalize_jcs(entry)?);
            }
            out.push(']');
            Ok(out)
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut out = String::from("{");
            for (idx, key) in keys.iter().enumerate() {
                if idx > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(*key).map_err(|e| e.to_string())?);
                out.push(':');
                out.push_str(&canonicalize_jcs(map.get(*key).ok_or("missing key")?)?);
            }
            out.push('}');
            Ok(out)
        }
    }
}

pub fn compute_action_hash(action_instance: &Value) -> Result<String, String> {
    let canonical = canonicalize_jcs(action_instance)?;
    let digest = Sha256::digest(canonical.as_bytes());
    Ok(format!("sha256:{}", URL_SAFE_NO_PAD.encode(digest)))
}

fn deep_equal(a: &Value, b: &Value) -> bool {
    match (canonicalize_jcs(a), canonicalize_jcs(b)) {
        (Ok(aa), Ok(bb)) => aa == bb,
        _ => false,
    }
}

fn is_subset_array(parent: &[Value], child: &[Value]) -> bool {
    child
        .iter()
        .all(|candidate| parent.iter().any(|entry| deep_equal(entry, candidate)))
}

fn compare_constraint(path: &str, parent: &Value, child: &Value, reasons: &mut Vec<String>) {
    match parent {
        Value::Null | Value::String(_) | Value::Bool(_) => {
            if !deep_equal(parent, child) {
                reasons.push(format!("{}: value differs", path));
            }
        }
        Value::Number(parent_num) => {
            if let Value::Number(child_num) = child {
                if parent_num != child_num {
                    reasons.push(format!("{}: numeric value differs", path));
                }
            } else {
                reasons.push(format!("{}: numeric value differs", path));
            }
        }
        Value::Array(parent_array) => {
            if let Value::Array(child_array) = child {
                if !is_subset_array(parent_array, child_array) {
                    reasons.push(format!("{}: child list must be subset of parent list", path));
                }
            } else {
                reasons.push(format!("{}: incompatible structures", path));
            }
        }
        Value::Object(parent_map) => {
            if let Value::Object(child_map) = child {
                for (key, parent_value) in parent_map {
                    let child_value = match child_map.get(key) {
                        Some(v) => v,
                        None => {
                            reasons.push(format!("{}.{}: missing in child", path, key));
                            continue;
                        }
                    };

                    if key == "max" || key == "le" {
                        let p = parent_value.as_f64();
                        let c = child_value.as_f64();
                        if p.is_none() || c.is_none() || c.unwrap() > p.unwrap() {
                            reasons.push(format!("{}.{}: child must be <= parent", path, key));
                        }
                        continue;
                    }

                    if key == "min" || key == "ge" {
                        let p = parent_value.as_f64();
                        let c = child_value.as_f64();
                        if p.is_none() || c.is_none() || c.unwrap() < p.unwrap() {
                            reasons.push(format!("{}.{}: child must be >= parent", path, key));
                        }
                        continue;
                    }

                    if key == "in" {
                        if let (Value::Array(p), Value::Array(c)) = (parent_value, child_value) {
                            if !is_subset_array(p, c) {
                                reasons.push(format!("{}.{}: child set must be subset of parent set", path, key));
                            }
                        } else {
                            reasons.push(format!("{}.{}: child set must be subset of parent set", path, key));
                        }
                        continue;
                    }

                    if key == "currency" {
                        let p = parent_value.as_str();
                        let c = child_value.as_str();
                        if p.is_none() || c.is_none() || p.unwrap().to_lowercase() != c.unwrap().to_lowercase() {
                            reasons.push(format!("{}.{}: currency must match", path, key));
                        }
                        continue;
                    }

                    compare_constraint(&format!("{}.{}", path, key), parent_value, child_value, reasons);
                }
            } else {
                reasons.push(format!("{}: incompatible structures", path));
            }
        }
    }
}

pub fn check_envelope_monotonicity(parent: &Value, child: &Value) -> Result<(), Vec<String>> {
    let mut reasons: Vec<String> = Vec::new();

    let parent_obj = match parent.as_object() {
        Some(v) => v,
        None => return Err(vec!["parent and child envelopes must be objects".to_string()]),
    };

    let child_obj = match child.as_object() {
        Some(v) => v,
        None => return Err(vec!["parent and child envelopes must be objects".to_string()]),
    };

    if let (Some(Value::String(parent_version)), Some(Value::String(child_version))) =
        (parent_obj.get("version"), child_obj.get("version"))
    {
        if parent_version != child_version {
            reasons.push("version mismatch".to_string());
        }
    }

    let parent_constraints = parent_obj.get("constraints").and_then(|v| v.as_object());
    let child_constraints = child_obj.get("constraints").and_then(|v| v.as_object());
    if parent_constraints.is_none() || child_constraints.is_none() {
        reasons.push("constraints must be objects".to_string());
    } else {
        let p = parent_constraints.unwrap();
        let c = child_constraints.unwrap();
        for (key, parent_constraint) in p {
            let child_constraint = match c.get(key) {
                Some(v) => v,
                None => {
                    reasons.push(format!("constraints.{}: missing in child", key));
                    continue;
                }
            };
            compare_constraint(
                &format!("constraints.{}", key),
                parent_constraint,
                child_constraint,
                &mut reasons,
            );
        }
    }

    if reasons.is_empty() {
        Ok(())
    } else {
        Err(reasons)
    }
}

pub fn evaluate_requester_continuity(input: &Value) -> Result<&'static str, String> {
    let obj = input.as_object().ok_or("expected object")?;
    Ok(if obj.get("continuity") == Some(&Value::String("intact".to_string())) {
        "allow"
    } else {
        "step_up_or_deny"
    })
}

pub fn evaluate_instruction_source(input: &Value) -> Result<&'static str, String> {
    let obj = input.as_object().ok_or("expected object")?;
    let mutability = obj.get("mutability").and_then(Value::as_str).unwrap_or("");
    let review_state = obj.get("review_state").and_then(Value::as_str).unwrap_or("");
    if mutability == "externally_editable" || review_state != "reviewed" {
        Ok("data")
    } else {
        Ok("instruction")
    }
}

pub fn evaluate_execution_budget(input: &Value) -> Result<&'static str, String> {
    let obj = input.as_object().ok_or("expected object")?;
    let may_persist = obj
        .get("may_create_persistent_process")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let process_type = obj
        .get("requested_process_type")
        .and_then(Value::as_str)
        .unwrap_or("");

    if !may_persist && matches!(process_type, "cron" | "daemon" | "monitor" | "recurring_workflow") {
        Ok("deny")
    } else {
        Ok("allow")
    }
}

pub fn evaluate_postcondition(input: &Value) -> Result<&'static str, String> {
    let obj = input.as_object().ok_or("expected object")?;
    let claimed = obj
        .get("claimed_success")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let verified = obj
        .get("verified_success")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if claimed && !verified {
        Ok("unverified_or_failed")
    } else if verified {
        Ok("verified")
    } else {
        Ok("unknown")
    }
}

pub fn validate_provenance_chain(input: &Value) -> Result<bool, String> {
    let obj = input.as_object().ok_or("expected object")?;
    let events = obj
        .get("events")
        .and_then(Value::as_array)
        .ok_or("events must be array")?;

    if events.is_empty() {
        return Ok(false);
    }

    for idx in 0..events.len() {
        let event = events[idx].as_object().ok_or("event must be object")?;
        let prev = event.get("prev_event_hash");
        if idx == 0 {
            if prev != Some(&Value::Null) {
                return Ok(false);
            }
            continue;
        }

        let previous = events[idx - 1]
            .as_object()
            .ok_or("previous event must be object")?;

        if prev != previous.get("event_hash") {
            return Ok(false);
        }
    }

    Ok(true)
}

pub fn evaluate_risk_policy(input: &Value) -> Result<&'static str, String> {
    let obj = input.as_object().ok_or("expected object")?;
    let risk = obj
        .get("risk")
        .and_then(Value::as_object)
        .ok_or("risk must be object")?;
    let recommended = risk
        .get("recommended_action")
        .and_then(Value::as_str)
        .unwrap_or("");
    if recommended == "step_up" {
        Ok("wauth_required")
    } else {
        Ok("permit")
    }
}

pub fn evaluate_multi_agent_trust(input: &Value) -> Result<&'static str, String> {
    let obj = input.as_object().ok_or("expected object")?;
    let basis = obj
        .get("assertion_basis")
        .and_then(Value::as_str)
        .unwrap_or("");
    let independent = obj
        .get("verified_independently")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if !independent && basis == "shared_channel" {
        Ok("insufficient_without_external_anchor")
    } else {
        Ok("sufficient")
    }
}

#[derive(Debug, Clone)]
pub struct CapabilityValidationInput<'a> {
    pub claims: &'a Value,
    pub expected_audience: &'a str,
    pub expected_action_hash: &'a str,
    pub now_epoch_seconds: i64,
    pub max_clock_skew_seconds: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapabilityValidationResult {
    pub ok: bool,
    pub errors: Vec<String>,
    pub replay_key: Option<String>,
}

fn audience_includes(aud_claim: &Value, expected_audience: &str) -> bool {
    if let Some(aud) = aud_claim.as_str() {
        return aud == expected_audience;
    }

    if let Some(aud_list) = aud_claim.as_array() {
        return aud_list
            .iter()
            .filter_map(Value::as_str)
            .any(|aud| aud == expected_audience);
    }

    false
}

pub fn validate_capability_claims(input: CapabilityValidationInput<'_>) -> CapabilityValidationResult {
    let mut errors: Vec<String> = Vec::new();
    let obj = match input.claims.as_object() {
        Some(v) => v,
        None => {
            return CapabilityValidationResult {
                ok: false,
                errors: vec!["claims must be an object".to_string()],
                replay_key: None,
            }
        }
    };

    let aud = obj.get("aud").unwrap_or(&Value::Null);
    if !audience_includes(aud, input.expected_audience) {
        errors.push("audience mismatch".to_string());
    }

    let exp = obj.get("exp").and_then(Value::as_i64);
    if exp.is_none() || exp.unwrap() < input.now_epoch_seconds - input.max_clock_skew_seconds {
        errors.push("token expired".to_string());
    }

    let iat = obj.get("iat").and_then(Value::as_i64);
    if iat.is_none() || iat.unwrap() > input.now_epoch_seconds + input.max_clock_skew_seconds {
        errors.push("issued-at is in the future beyond skew".to_string());
    }

    let action_hash = obj.get("action_hash").and_then(Value::as_str).unwrap_or("");
    if action_hash != input.expected_action_hash {
        errors.push("action hash mismatch".to_string());
    }

    let jti = obj.get("jti").and_then(Value::as_str);
    if jti.is_none() || jti.unwrap().is_empty() {
        errors.push("missing jti for replay protection".to_string());
    }

    CapabilityValidationResult {
        ok: errors.is_empty(),
        errors,
        replay_key: jti.map(str::to_string),
    }
}

pub fn build_wauth_request(args: Value, request_id: Option<&str>, namespace: Option<&str>) -> Result<Value, String> {
    let namespace = namespace.unwrap_or("aaif.wauth");
    let mut args_obj = args
        .as_object()
        .cloned()
        .ok_or("args must be a JSON object")?;

    if let Some(req_id) = request_id {
        args_obj.insert("requestId".to_string(), Value::String(req_id.to_string()));
    }

    Ok(serde_json::json!({
        "name": format!("{}.request", namespace),
        "arguments": args_obj
    }))
}

pub fn build_wauth_oid4vp_request(
    oid4vp_request: Value,
    mode: Option<&str>,
    response_uri: Option<&str>,
    request_id: Option<&str>,
    namespace: Option<&str>,
) -> Value {
    let mut args = serde_json::Map::new();
    args.insert("oid4vpRequest".to_string(), oid4vp_request);
    if let Some(value) = mode {
        args.insert("mode".to_string(), Value::String(value.to_string()));
    }
    if let Some(value) = response_uri {
        args.insert("response_uri".to_string(), Value::String(value.to_string()));
    }
    if let Some(value) = request_id {
        args.insert("requestId".to_string(), Value::String(value.to_string()));
    }

    serde_json::json!({
        "name": format!("{}.request", namespace.unwrap_or("aaif.wauth")),
        "arguments": args
    })
}

pub fn build_wauth_oid4vci_request(
    oid4vci_offer: Value,
    request_id: Option<&str>,
    namespace: Option<&str>,
) -> Value {
    let mut args = serde_json::Map::new();
    args.insert("oid4vciOffer".to_string(), oid4vci_offer);
    if let Some(value) = request_id {
        args.insert("requestId".to_string(), Value::String(value.to_string()));
    }

    serde_json::json!({
        "name": format!("{}.request", namespace.unwrap_or("aaif.wauth")),
        "arguments": args
    })
}

pub fn build_wauth_reqsig_forwarding_request(
    wauth_required: Value,
    action_instance: Option<Value>,
    request_id: Option<&str>,
    namespace: Option<&str>,
) -> Value {
    let mut args = serde_json::Map::new();
    args.insert("wauthRequired".to_string(), wauth_required);
    if let Some(value) = action_instance {
        args.insert("actionInstance".to_string(), value);
    }
    if let Some(value) = request_id {
        args.insert("requestId".to_string(), Value::String(value.to_string()));
    }

    serde_json::json!({
        "name": format!("{}.request", namespace.unwrap_or("aaif.wauth")),
        "arguments": args
    })
}

pub fn build_wauth_get(reference: &str, namespace: Option<&str>) -> Value {
    let namespace = namespace.unwrap_or("aaif.wauth");
    serde_json::json!({
        "name": format!("{}.get", namespace),
        "arguments": {
            "ref": reference
        }
    })
}

pub fn build_wauth_get_from_artifact(artifact: &Value, namespace: Option<&str>) -> Result<Value, String> {
    let reference = artifact
        .get("ref")
        .and_then(Value::as_str)
        .ok_or("WAUTH artifact must include a non-empty ref")?;
    if reference.is_empty() {
        return Err("WAUTH artifact must include a non-empty ref".to_string());
    }
    Ok(build_wauth_get(reference, namespace))
}

pub fn build_wauth_metadata(namespace: Option<&str>) -> Value {
    let namespace = namespace.unwrap_or("aaif.wauth");
    serde_json::json!({
        "name": format!("{}.metadata", namespace),
        "arguments": {}
    })
}

pub fn extract_elicitations(error_payload: &Value) -> Vec<Value> {
    let data = match error_payload.get("data").and_then(Value::as_object) {
        Some(v) => v,
        None => return Vec::new(),
    };

    match data.get("elicitations").and_then(Value::as_array) {
        Some(arr) => arr.to_vec(),
        None => Vec::new(),
    }
}

fn resolve_structured_content(tool_result: &Value) -> &Value {
    match tool_result.get("structuredContent") {
        Some(content) => content,
        None => tool_result,
    }
}

pub fn parse_wauth_result_envelope(tool_result: &Value) -> Result<Value, String> {
    let content = resolve_structured_content(tool_result);
    let obj = content
        .as_object()
        .ok_or("WAUTH result envelope must be a JSON object")?;

    if !obj.get("version").map(Value::is_string).unwrap_or(false)
        || !obj.get("requestId").map(Value::is_string).unwrap_or(false)
    {
        return Err("WAUTH result envelope missing required fields: version/requestId".to_string());
    }

    Ok(content.clone())
}

pub fn parse_wauth_get_artifact(
    tool_result: &Value,
    expected_kind: Option<&str>,
    expected_format: Option<&str>,
) -> Result<Value, String> {
    let content = resolve_structured_content(tool_result);
    let obj = content
        .as_object()
        .ok_or("WAUTH get response must be a JSON object")?;

    let kind = obj.get("kind").and_then(Value::as_str);
    let format = obj.get("format").and_then(Value::as_str);
    if kind.is_none() || format.is_none() {
        return Err("WAUTH get response missing required fields: kind/format".to_string());
    }

    let has_inline = obj.contains_key("inline");
    let has_ref = obj
        .get("ref")
        .and_then(Value::as_str)
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    if !has_inline && !has_ref {
        return Err("WAUTH get response must include inline or ref".to_string());
    }

    if let Some(expected) = expected_kind {
        if kind.unwrap() != expected {
            return Err(format!("WAUTH get response kind mismatch: expected {}", expected));
        }
    }
    if let Some(expected) = expected_format {
        if format.unwrap() != expected {
            return Err(format!("WAUTH get response format mismatch: expected {}", expected));
        }
    }

    Ok(content.clone())
}

pub fn extract_artifact_refs(result_envelope: &Value) -> Vec<String> {
    let artifacts = match result_envelope.get("artifacts").and_then(Value::as_array) {
        Some(v) => v,
        None => return Vec::new(),
    };

    artifacts
        .iter()
        .filter_map(|artifact| artifact.get("ref").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

fn is_string_array(value: Option<&Value>) -> bool {
    match value.and_then(Value::as_array) {
        Some(values) => values.iter().all(Value::is_string),
        None => false,
    }
}

pub fn parse_wauth_metadata(tool_result: &Value) -> Result<Value, String> {
    let content = resolve_structured_content(tool_result);
    let obj = content
        .as_object()
        .ok_or("WAUTH metadata response must be a JSON object")?;

    if !obj.get("issuer").map(Value::is_string).unwrap_or(false) {
        return Err("WAUTH metadata missing required field: issuer".to_string());
    }
    if !obj.get("jwks_uri").map(Value::is_string).unwrap_or(false) {
        return Err("WAUTH metadata missing required field: jwks_uri".to_string());
    }
    if !is_string_array(obj.get("wauth_versions_supported")) {
        return Err("WAUTH metadata missing required string array: wauth_versions_supported".to_string());
    }
    if !is_string_array(obj.get("intent_versions_supported")) {
        return Err("WAUTH metadata missing required string array: intent_versions_supported".to_string());
    }
    if !is_string_array(obj.get("profiles_supported")) {
        return Err("WAUTH metadata missing required string array: profiles_supported".to_string());
    }
    if !is_string_array(obj.get("formats_supported")) {
        return Err("WAUTH metadata missing required string array: formats_supported".to_string());
    }

    let mcp = obj
        .get("mcp")
        .and_then(Value::as_object)
        .ok_or("WAUTH metadata missing required field: mcp")?;
    if !is_string_array(mcp.get("tool_namespaces_supported")) {
        return Err("WAUTH metadata missing required string array: mcp.tool_namespaces_supported".to_string());
    }
    if !is_string_array(mcp.get("tools_supported")) {
        return Err("WAUTH metadata missing required string array: mcp.tools_supported".to_string());
    }

    Ok(content.clone())
}

pub fn metadata_supports_tool(metadata: &Value, tool_name: &str) -> bool {
    metadata
        .get("mcp")
        .and_then(Value::as_object)
        .and_then(|mcp| mcp.get("tools_supported"))
        .and_then(Value::as_array)
        .map(|tools| tools.iter().any(|tool| tool.as_str() == Some(tool_name)))
        .unwrap_or(false)
}

pub fn metadata_supports_namespace(metadata: &Value, namespace: &str) -> bool {
    metadata
        .get("mcp")
        .and_then(Value::as_object)
        .and_then(|mcp| mcp.get("tool_namespaces_supported"))
        .and_then(Value::as_array)
        .map(|namespaces| namespaces.iter().any(|item| item.as_str() == Some(namespace)))
        .unwrap_or(false)
}

pub fn metadata_supports_profile(metadata: &Value, profile: &str) -> bool {
    metadata
        .get("profiles_supported")
        .and_then(Value::as_array)
        .map(|profiles| profiles.iter().any(|item| item.as_str() == Some(profile)))
        .unwrap_or(false)
}

pub fn metadata_supports_format(metadata: &Value, format: &str) -> bool {
    metadata
        .get("formats_supported")
        .and_then(Value::as_array)
        .map(|formats| formats.iter().any(|item| item.as_str() == Some(format)))
        .unwrap_or(false)
}

pub fn metadata_supports_wauth_version(metadata: &Value, version: &str) -> bool {
    metadata
        .get("wauth_versions_supported")
        .and_then(Value::as_array)
        .map(|versions| versions.iter().any(|item| item.as_str() == Some(version)))
        .unwrap_or(false)
}

pub fn well_known_wauth_config_url(issuer: &str) -> String {
    let normalized = issuer.strip_suffix('/').unwrap_or(issuer);
    format!("{}/.well-known/aaif-wauth-configuration", normalized)
}

pub fn validate_against_schema(schema: &Value, instance: &Value) -> Result<(), Vec<String>> {
    let compiled = JSONSchema::options()
        .with_draft(Draft::Draft7)
        .compile(schema)
        .map_err(|err| vec![format!("schema compilation error: {}", err)])?;

    let validation_result = compiled.validate(instance);
    if let Err(errors) = validation_result {
        let collected: Vec<String> = errors.map(|err| err.to_string()).collect();
        return Err(collected);
    }

    Ok(())
}

#[derive(Debug, Clone)]
pub struct JwtVerificationResult {
    pub ok: bool,
    pub errors: Vec<String>,
    pub header: Option<Value>,
    pub claims: Option<Value>,
    pub replay_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapabilityJwtVerificationResult {
    pub ok: bool,
    pub errors: Vec<String>,
    pub replay_key: Option<String>,
    pub claims: Option<Value>,
    pub header: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct CachedJwks {
    pub jwks: Value,
    pub fetched_at_epoch_seconds: i64,
    pub expires_at_epoch_seconds: i64,
}

#[derive(Debug, Clone)]
pub struct WauthJwksCache {
    ttl_seconds: i64,
    by_issuer: HashMap<String, CachedJwks>,
}

impl WauthJwksCache {
    pub fn new(ttl_seconds: i64) -> Self {
        Self {
            ttl_seconds,
            by_issuer: HashMap::new(),
        }
    }

    pub fn fetch_metadata<F>(&self, issuer: &str, mut fetch_json: F) -> Result<Value, String>
    where
        F: FnMut(&str) -> Result<Value, String>,
    {
        let metadata_url = well_known_wauth_config_url(issuer);
        let payload = fetch_json(&metadata_url)?;
        let metadata = parse_wauth_metadata(&payload)?;
        Ok(metadata)
    }

    pub fn fetch_jwks_from_metadata<F>(
        &self,
        metadata: &Value,
        mut fetch_json: F,
    ) -> Result<Value, String>
    where
        F: FnMut(&str) -> Result<Value, String>,
    {
        let jwks_uri = metadata
            .get("jwks_uri")
            .and_then(Value::as_str)
            .ok_or("WAUTH metadata missing required field: jwks_uri")?;
        let jwks = fetch_json(jwks_uri)?;
        if !jwks.get("keys").map(Value::is_array).unwrap_or(false) {
            return Err("invalid JWKS payload".to_string());
        }
        Ok(jwks)
    }

    pub fn get_for_issuer<F>(
        &mut self,
        issuer: &str,
        now_epoch_seconds: i64,
        force_refresh: bool,
        mut fetch_json: F,
    ) -> Result<Value, String>
    where
        F: FnMut(&str) -> Result<Value, String>,
    {
        if !force_refresh {
            if let Some(existing) = self.by_issuer.get(issuer) {
                if existing.expires_at_epoch_seconds > now_epoch_seconds {
                    return Ok(existing.jwks.clone());
                }
            }
        }

        let metadata = self.fetch_metadata(issuer, &mut fetch_json)?;
        let jwks = self.fetch_jwks_from_metadata(&metadata, &mut fetch_json)?;
        self.by_issuer.insert(
            issuer.to_string(),
            CachedJwks {
                jwks: jwks.clone(),
                fetched_at_epoch_seconds: now_epoch_seconds,
                expires_at_epoch_seconds: now_epoch_seconds + self.ttl_seconds,
            },
        );
        Ok(jwks)
    }

    pub fn get_for_kid<F>(
        &mut self,
        issuer: &str,
        kid: &str,
        now_epoch_seconds: i64,
        mut fetch_json: F,
    ) -> Result<(Value, Option<Value>), String>
    where
        F: FnMut(&str) -> Result<Value, String>,
    {
        let jwks = self.get_for_issuer(issuer, now_epoch_seconds, false, &mut fetch_json)?;
        if let Some(key) = find_jwk_by_kid(&jwks, kid) {
            return Ok((jwks, Some(key)));
        }

        let refreshed = self.get_for_issuer(issuer, now_epoch_seconds, true, &mut fetch_json)?;
        let key = find_jwk_by_kid(&refreshed, kid);
        Ok((refreshed, key))
    }

    pub fn clear(&mut self, issuer: Option<&str>) {
        if let Some(iss) = issuer {
            self.by_issuer.remove(iss);
        } else {
            self.by_issuer.clear();
        }
    }
}

fn find_jwk_by_kid(jwks: &Value, kid: &str) -> Option<Value> {
    let keys = jwks.get("keys")?.as_array()?;
    keys.iter()
        .find(|key| key.get("kid").and_then(Value::as_str) == Some(kid))
        .cloned()
}

fn parse_jwt_segments(token: &str) -> Result<(&str, &str, &str), String> {
    let mut parts = token.split('.');
    let header = parts.next().ok_or("invalid JWT: missing header segment")?;
    let payload = parts.next().ok_or("invalid JWT: missing payload segment")?;
    let signature = parts.next().ok_or("invalid JWT: missing signature segment")?;
    if parts.next().is_some() {
        return Err("invalid JWT: too many segments".to_string());
    }
    Ok((header, payload, signature))
}

pub fn decode_jwt_header(token: &str) -> Result<Value, String> {
    let header = jwt_decode_header(token).map_err(|err| format!("invalid JWT protected header: {}", err))?;
    serde_json::to_value(header).map_err(|err| format!("failed to serialize JWT header: {}", err))
}

pub fn decode_jwt_payload(token: &str) -> Result<Value, String> {
    let (_header, payload, _signature) = parse_jwt_segments(token)?;
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|err| format!("invalid JWT payload encoding: {}", err))?;
    serde_json::from_slice::<Value>(&decoded).map_err(|err| format!("invalid JWT payload JSON: {}", err))
}

fn extract_action_hash_from_claims(claims: &Value) -> Option<String> {
    if let Some(action_hash) = claims.get("action_hash").and_then(Value::as_str) {
        return Some(action_hash.to_string());
    }

    let authorization_details = claims.get("authorization_details").and_then(Value::as_array)?;
    for detail in authorization_details {
        if let Some(action_hash) = detail.get("action_hash").and_then(Value::as_str) {
            return Some(action_hash.to_string());
        }
    }

    None
}

fn select_decoding_key_from_jwks(jwks: &Value, kid: Option<&str>) -> Result<DecodingKey, String> {
    let set: JwkSet = serde_json::from_value(jwks.clone())
        .map_err(|err| format!("invalid JWKS payload: {}", err))?;

    let jwk = if let Some(key_id) = kid {
        set.find(key_id)
            .ok_or_else(|| "no matching JWK found for token".to_string())?
    } else if set.keys.len() == 1 {
        &set.keys[0]
    } else {
        return Err("no matching JWK found for token".to_string());
    };

    DecodingKey::from_jwk(jwk).map_err(|err| format!("failed to create decoding key from JWK: {}", err))
}

pub fn verify_jwt_with_jwks(
    token: &str,
    jwks: &Value,
    expected_issuer: Option<&str>,
    expected_audience: Option<&str>,
    expected_subject: Option<&str>,
    now_epoch_seconds: Option<i64>,
    clock_tolerance_seconds: i64,
    expected_action_hash: Option<&str>,
    allowed_algorithms: Option<Vec<Algorithm>>,
    require_jti: bool,
) -> JwtVerificationResult {
    let header = match jwt_decode_header(token) {
        Ok(h) => h,
        Err(err) => {
            return JwtVerificationResult {
                ok: false,
                errors: vec![format!("invalid JWT protected header: {}", err)],
                header: None,
                claims: None,
                replay_key: None,
            }
        }
    };

    let header_value = serde_json::to_value(&header).ok();
    let algorithms = allowed_algorithms.unwrap_or_else(|| {
        vec![Algorithm::RS256, Algorithm::ES256, Algorithm::EdDSA]
    });

    if !algorithms.contains(&header.alg) {
        return JwtVerificationResult {
            ok: false,
            errors: vec![format!("token algorithm not allowed: {:?}", header.alg)],
            header: header_value,
            claims: None,
            replay_key: None,
        };
    }

    let decoding_key =
        match select_decoding_key_from_jwks(jwks, header.kid.as_deref()) {
            Ok(key) => key,
            Err(err) => {
                return JwtVerificationResult {
                    ok: false,
                    errors: vec![err],
                    header: header_value,
                    claims: None,
                    replay_key: None,
                }
            }
        };

    let mut validation = Validation::new(header.alg);
    validation.algorithms = vec![header.alg];
    validation.leeway = clock_tolerance_seconds.max(0) as u64;
    validation.validate_exp = false;
    validation.validate_nbf = false;
    validation.required_spec_claims = HashSet::new();
    validation.validate_aud = expected_audience.is_some();

    if let Some(audience) = expected_audience {
        validation.set_audience(&[audience]);
    }
    if let Some(issuer) = expected_issuer {
        validation.set_issuer(&[issuer]);
    }
    if let Some(subject) = expected_subject {
        validation.sub = Some(subject.to_string());
    }

    let token_data = match decode::<Value>(token, &decoding_key, &validation) {
        Ok(data) => data,
        Err(err) => {
            return JwtVerificationResult {
                ok: false,
                errors: vec![format!("JWT verification failed: {}", err)],
                header: header_value,
                claims: None,
                replay_key: None,
            }
        }
    };

    let now = now_epoch_seconds.unwrap_or_else(|| get_current_timestamp() as i64);
    let mut errors: Vec<String> = Vec::new();
    let claims = token_data.claims;
    let claims_obj = match claims.as_object() {
        Some(v) => v,
        None => {
            return JwtVerificationResult {
                ok: false,
                errors: vec!["JWT payload must be an object".to_string()],
                header: header_value,
                claims: Some(claims),
                replay_key: None,
            }
        }
    };

    let exp = claims_obj.get("exp").and_then(Value::as_i64);
    if exp.is_none() || exp.unwrap() < now - clock_tolerance_seconds {
        errors.push("token expired".to_string());
    }

    let iat = claims_obj.get("iat").and_then(Value::as_i64);
    if iat.is_none() || iat.unwrap() > now + clock_tolerance_seconds {
        errors.push("issued-at is in the future beyond skew".to_string());
    }

    if let Some(subject) = expected_subject {
        if claims_obj.get("sub").and_then(Value::as_str) != Some(subject) {
            errors.push("subject mismatch".to_string());
        }
    }

    if let Some(expected_hash) = expected_action_hash {
        if extract_action_hash_from_claims(&claims).as_deref() != Some(expected_hash) {
            errors.push("action hash mismatch".to_string());
        }
    }

    let jti = claims_obj.get("jti").and_then(Value::as_str).map(str::to_string);
    if require_jti && jti.is_none() {
        errors.push("missing jti for replay protection".to_string());
    }

    JwtVerificationResult {
        ok: errors.is_empty(),
        errors,
        header: header_value,
        claims: Some(claims),
        replay_key: jti,
    }
}

pub fn verify_capability_jwt_with_jwks(
    token: &str,
    jwks: &Value,
    expected_issuer: Option<&str>,
    expected_audience: &str,
    expected_action_hash: &str,
    now_epoch_seconds: Option<i64>,
    max_clock_skew_seconds: i64,
    allowed_algorithms: Option<Vec<Algorithm>>,
) -> CapabilityJwtVerificationResult {
    let jwt_result = verify_jwt_with_jwks(
        token,
        jwks,
        expected_issuer,
        Some(expected_audience),
        None,
        now_epoch_seconds,
        max_clock_skew_seconds,
        Some(expected_action_hash),
        allowed_algorithms,
        true,
    );

    if !jwt_result.ok || jwt_result.claims.is_none() {
        return CapabilityJwtVerificationResult {
            ok: false,
            errors: jwt_result.errors,
            replay_key: jwt_result.replay_key,
            claims: jwt_result.claims,
            header: jwt_result.header,
        };
    }

    let claims = jwt_result.claims.clone().unwrap_or(Value::Null);
    let now = now_epoch_seconds.unwrap_or_else(|| get_current_timestamp() as i64);
    let claim_result = validate_capability_claims(CapabilityValidationInput {
        claims: &claims,
        expected_audience,
        expected_action_hash,
        now_epoch_seconds: now,
        max_clock_skew_seconds,
    });

    CapabilityJwtVerificationResult {
        ok: jwt_result.ok && claim_result.ok,
        errors: [jwt_result.errors, claim_result.errors].concat(),
        replay_key: claim_result.replay_key.or(jwt_result.replay_key),
        claims: Some(claims),
        header: jwt_result.header,
    }
}
