use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde_json::json;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use wauth_rs::{
    build_wauth_get, build_wauth_get_from_artifact, build_wauth_metadata, build_wauth_oid4vci_request,
    build_wauth_oid4vp_request, build_wauth_reqsig_forwarding_request, build_wauth_request,
    decode_jwt_header, decode_jwt_payload, extract_artifact_refs, extract_elicitations,
    metadata_supports_format, metadata_supports_namespace, metadata_supports_profile,
    metadata_supports_tool, metadata_supports_wauth_version, parse_wauth_get_artifact,
    parse_wauth_metadata, parse_wauth_result_envelope, validate_against_schema,
    validate_capability_claims, verify_capability_jwt_with_jwks, verify_jwt_with_jwks,
    well_known_wauth_config_url, CapabilityValidationInput, WauthJwksCache,
};

const RSA_PRIVATE_KEY_PEM: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfTxyzKr0jI52X
m07golA1LPZScY8XER5OlcoNhAlo+5JCMB2PBRIjdED9eODi1w6v5tbZXiu8ddjA
C87kV82kv7ppL7o70ferWqBMs5XTBz4xGdXGfk36SQBoW12WrmM49EXmB03UF8LQ
nvSX13OXW4hUGiYSgBtbKSoWCcZ/aP7igA6MCZskmw0FxX3zmzSRt3gew6BWR2qA
/G9sBQ/KByy8LBom7A7Mg+Rk8MsiaPfXtNQnk4jx1SjPbMG5nj7qLUghCcAwTze+
vvQ7am1CB2DZHlY+MRKn2LEs+SJuOtiY61i/edCYB8YGGqAPd3CwoCQW8rcx+rWS
Y3e5hwH/AgMBAAECggEAN7GKbeD15QKn9jzE0l+I84owMOWjk1Qwo9bV2sMYebds
hddsN9RC7ta6srzoEYsjXZmL8hB7hfg6Q8NuKSMA5drvifZeUzcNtw3WNur/Le97
glF4MJYlqot0b5KB5+e8VWMO38zoi0IV02QhipEwggpRGPCgmDKdIAJHPdHYUMQO
sgX/VA9egSrgLIonlGhkTybEw1I1Qa1+pjBoR6PXVzv+lvQOE2GYlPn0MmmZrdyn
UJuR87Uem2uT7EsijkSzWhM67lY3VcjvJjq/wCYOBosG1Gzc+oeujlkljilbltmX
RR42JxlxzTpGf8f5eRTz+0jjZX5IzL0OP2wW4dgwcQKBgQDwAJenOgy8oQD2Bzih
V7+upA1KlpPrZ7EkilLTVy148IQAK1e+eAhDHHd6VBv18yBnzniKqYXLurf/uOS6
gFyLtN7dh1mQqcbA0KrbRi8VETcF9jUp2pwA8qruxVJP1g+trwYemQ77wsakOiab
PUdwd/pzUuDABY02zZC5OMh/KQKBgQDuMao8B2CdCY4yYZPkal16QGBE1gdB+P2b
oCCmvybjP8Qk3FfLqWHAlv8BM3a/fDYcFYg9iaiGR3pkh0R+rG7cPzYfxdJ9vjFO
FIfvoHR2TMUulhuZgIAMjesGH69QxDlLCqNA3UPde9ZVz2w9EDwbWDl0FZDnWrJE
u4u+BLak5wKBgBy/VWr4bxIhDuZpUwUwZ4tZpyXqB2nJD9TapLUf2hiEZqtGhcoQ
wpyXSlBixr6dEqKcfp/NUnNmuCdvVCZqvasWTSOn1LiZPW9XD0AYlgcl+rtCFHgg
8VLDvmm/RO6/Kz2Ym1kK6FqLqBN/y6QIoQf9twgdQ0J8579KvC0TeiCRAoGBAJdA
0mjsBl2yA6nabJ9PK6zF1FvhzRoHkoOQWyuHlpoXk+YURWv+UySIvcV1eKJ/rZyH
z8vD7k/Wc9ICU2xc8sjJGwVyCQfwDj8Wqntv2ISGm2/JwhznjGhsdiGdXSZcdEVC
rAg0eTPbv28eGA1ukbyLeXBNgYZoAWvD7CjttU1hAoGAaYXhDUfWueWl+xhzQsGy
KBTjVUNpdUn7v8REUe9FN9mPT34OGPTdgyt7D1oy6iASPs0WnCOoZCLadSIWgHBy
MCYRFTieziQV1TNE7ZVkQmjoHNohwYX1NMIDau53quEQn+iCo88IRbaTMzR1+X9w
LviNASzboBMK99v9nH4oirg=
-----END PRIVATE KEY-----"#;

const RSA_PUBLIC_JWK_JSON: &str = r#"{"kty":"RSA","key_ops":["verify"],"n":"308csyq9IyOdl5tO4KJQNSz2UnGPFxEeTpXKDYQJaPuSQjAdjwUSI3RA_Xjg4tcOr-bW2V4rvHXYwAvO5FfNpL-6aS-6O9H3q1qgTLOV0wc-MRnVxn5N-kkAaFtdlq5jOPRF5gdN1BfC0J70l9dzl1uIVBomEoAbWykqFgnGf2j-4oAOjAmbJJsNBcV985s0kbd4HsOgVkdqgPxvbAUPygcsvCwaJuwOzIPkZPDLImj317TUJ5OI8dUoz2zBuZ4-6i1IIQnAME83vr70O2ptQgdg2R5WPjESp9ixLPkibjrYmOtYv3nQmAfGBhqgD3dwsKAkFvK3Mfq1kmN3uYcB_w","e":"AQAB","kid":"rust-test-rsa-key","alg":"RS256","use":"sig"}"#;

fn load_json(relative_path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("failed to resolve root path");
    let full_path = root.join(relative_path);
    let content = fs::read_to_string(full_path).expect("failed to read json file");
    serde_json::from_str(&content).expect("failed to parse json")
}

fn build_test_jwks() -> Value {
    let jwk: Value = serde_json::from_str(RSA_PUBLIC_JWK_JSON).expect("invalid JWK fixture");
    json!({ "keys": [jwk] })
}

fn build_test_token(now: i64) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some("rust-test-rsa-key".to_string());
    header.typ = Some("JWT".to_string());

    let claims = json!({
        "iss": "https://wauth.example",
        "aud": "https://rp.example/api/payments",
        "iat": now,
        "exp": now + 600,
        "jti": "cap-jti-rs-1",
        "action_hash": "sha256:test"
    });

    encode(
        &header,
        &claims,
        &EncodingKey::from_rsa_pem(RSA_PRIVATE_KEY_PEM.as_bytes()).expect("invalid private key fixture"),
    )
    .expect("failed to sign token")
}

#[test]
fn build_mcp_requests() {
    let request = build_wauth_request(
        json!({"walletIntent": {"profile": "x"}}),
        Some("req-1"),
        None,
    )
    .unwrap();

    let get_request = build_wauth_get("artifact://cap/123", None);
    let metadata_request = build_wauth_metadata(None);

    assert_eq!(request["name"], "aaif.wauth.request");
    assert_eq!(request["arguments"]["requestId"], "req-1");
    assert_eq!(get_request, json!({"name": "aaif.wauth.get", "arguments": {"ref": "artifact://cap/123"}}));
    assert_eq!(metadata_request, json!({"name": "aaif.wauth.metadata", "arguments": {}}));
}

#[test]
fn build_mode_specific_mcp_requests() {
    let oid4vp = build_wauth_oid4vp_request(
        json!("openid-vp://request"),
        Some("direct_post"),
        Some("https://wallet.example/response"),
        Some("req-vp-1"),
        None,
    );
    let oid4vci = build_wauth_oid4vci_request(
        json!("openid-credential-offer://offer"),
        Some("req-vci-1"),
        None,
    );
    let reqsig = build_wauth_reqsig_forwarding_request(
        json!({"error": "insufficient_authorization"}),
        Some(json!({"profile": "example-action", "amount_minor": 1000})),
        Some("req-rpsig-1"),
        None,
    );

    assert_eq!(oid4vp["arguments"]["mode"], "direct_post");
    assert_eq!(oid4vp["arguments"]["requestId"], "req-vp-1");
    assert_eq!(oid4vci["arguments"]["requestId"], "req-vci-1");
    assert_eq!(reqsig["arguments"]["requestId"], "req-rpsig-1");
    assert_eq!(reqsig["arguments"]["wauthRequired"], json!({"error": "insufficient_authorization"}));
}

#[test]
fn parse_result_and_metadata() {
    let result = json!({
        "structuredContent": {
            "version": "0.1",
            "requestId": "req-1",
            "artifacts": [
                {"kind": "WAUTH-CAP", "format": "jwt", "ref": "artifact://cap/123"},
                {"kind": "WAUTH-REC", "format": "json", "inline": {"event_id": "evt-1"}}
            ]
        }
    });

    let envelope = parse_wauth_result_envelope(&result).expect("failed to parse result envelope");
    assert_eq!(envelope["requestId"], "req-1");
    assert_eq!(extract_artifact_refs(&envelope), vec!["artifact://cap/123".to_string()]);

    let metadata = parse_wauth_metadata(&json!({
        "structuredContent": {
            "issuer": "https://wauth.example",
            "jwks_uri": "https://wauth.example/jwks",
            "wauth_versions_supported": ["0.5.1"],
            "intent_versions_supported": ["0.2"],
            "profiles_supported": ["wauth-rp-reqsig/v0.1"],
            "formats_supported": ["jwt"],
            "mcp": {
                "tool_namespaces_supported": ["aaif.wauth"],
                "tools_supported": ["aaif.wauth.request", "aaif.wauth.get", "aaif.wauth.metadata"]
            }
        }
    }))
    .expect("failed to parse metadata response");

    assert_eq!(metadata["issuer"], "https://wauth.example");
    assert_eq!(metadata["jwks_uri"], "https://wauth.example/jwks");
    assert!(metadata_supports_tool(&metadata, "aaif.wauth.request"));
    assert!(metadata_supports_namespace(&metadata, "aaif.wauth"));
    assert!(metadata_supports_profile(&metadata, "wauth-rp-reqsig/v0.1"));
    assert!(metadata_supports_format(&metadata, "jwt"));
    assert!(metadata_supports_wauth_version(&metadata, "0.5.1"));
}

#[test]
fn parse_get_artifact_and_build_get_from_artifact() {
    let get_request = build_wauth_get_from_artifact(
        &json!({
            "kind": "WAUTH-CAP",
            "format": "jwt",
            "ref": "artifact://cap/999"
        }),
        None,
    )
    .expect("failed to build get request from artifact");

    assert_eq!(
        get_request,
        json!({"name": "aaif.wauth.get", "arguments": {"ref": "artifact://cap/999"}})
    );

    let artifact = parse_wauth_get_artifact(
        &json!({
            "structuredContent": {
                "kind": "WAUTH-CAP",
                "format": "jwt",
                "inline": {"token": "jwt-value"}
            }
        }),
        Some("WAUTH-CAP"),
        Some("jwt"),
    )
    .expect("failed to parse get artifact");

    assert_eq!(artifact["kind"], "WAUTH-CAP");
    assert_eq!(artifact["format"], "jwt");
}

#[test]
fn extract_elicitation_payload() {
    let payload = json!({
        "code": -32042,
        "data": {
            "elicitations": [
                {
                    "mode": "url",
                    "url": "https://issuer.example/approve"
                }
            ]
        }
    });

    let elicitations = extract_elicitations(&payload);
    assert_eq!(elicitations.len(), 1);
}

#[test]
fn validate_rp_claims() {
    let claims = json!({
        "aud": "https://rp.example/api/payments",
        "exp": 2000000000,
        "iat": 1999999000,
        "jti": "jti-1",
        "action_hash": "sha256:test"
    });

    let result = validate_capability_claims(CapabilityValidationInput {
        claims: &claims,
        expected_audience: "https://rp.example/api/payments",
        expected_action_hash: "sha256:test",
        now_epoch_seconds: 1999999500,
        max_clock_skew_seconds: 120,
    });

    assert!(result.ok);
    assert_eq!(result.replay_key.as_deref(), Some("jti-1"));
}

#[test]
fn verify_jwt_with_jwks_helpers() {
    let now = 1_700_000_000;
    let token = build_test_token(now);
    let jwks = build_test_jwks();

    let raw_result = verify_jwt_with_jwks(
        &token,
        &jwks,
        Some("https://wauth.example"),
        Some("https://rp.example/api/payments"),
        None,
        Some(now + 10),
        120,
        None,
        None,
        true,
    );
    assert!(raw_result.ok, "{:?}", raw_result.errors);

    let capability_result = verify_capability_jwt_with_jwks(
        &token,
        &jwks,
        Some("https://wauth.example"),
        "https://rp.example/api/payments",
        "sha256:test",
        Some(now + 10),
        120,
        None,
    );
    assert!(capability_result.ok, "{:?}", capability_result.errors);
    assert_eq!(capability_result.replay_key.as_deref(), Some("cap-jti-rs-1"));

    let header = decode_jwt_header(&token).expect("failed to decode header");
    let payload = decode_jwt_payload(&token).expect("failed to decode payload");
    assert_eq!(header["kid"], "rust-test-rsa-key");
    assert_eq!(payload["iss"], "https://wauth.example");
}

#[test]
fn jwt_verification_fails_for_tampered_token() {
    let now = 1_700_000_000;
    let token = build_test_token(now);
    let parts: Vec<&str> = token.split('.').collect();
    assert_eq!(parts.len(), 3);
    let signature = parts[2];
    let mut sig_chars: Vec<char> = signature.chars().collect();
    sig_chars[0] = if sig_chars[0] == 'a' { 'b' } else { 'a' };
    let tampered_signature: String = sig_chars.into_iter().collect();
    let tampered = format!("{}.{}.{}", parts[0], parts[1], tampered_signature);

    let jwks = build_test_jwks();
    let result = verify_jwt_with_jwks(
        &tampered,
        &jwks,
        Some("https://wauth.example"),
        Some("https://rp.example/api/payments"),
        None,
        Some(now + 10),
        120,
        None,
        None,
        true,
    );

    assert!(!result.ok);
    assert!(result
        .errors
        .iter()
        .any(|error| error.contains("JWT verification failed")));
}

#[test]
fn capability_verification_fails_on_action_hash_mismatch() {
    let now = 1_700_000_000;
    let token = build_test_token(now);
    let jwks = build_test_jwks();

    let result = verify_capability_jwt_with_jwks(
        &token,
        &jwks,
        Some("https://wauth.example"),
        "https://rp.example/api/payments",
        "sha256:not-the-same",
        Some(now + 10),
        120,
        None,
    );

    assert!(!result.ok);
    assert!(result.errors.iter().any(|error| error == "action hash mismatch"));
}

#[test]
fn jwks_cache_fetch_and_refresh() {
    let mut calls: Vec<String> = Vec::new();
    let mut jwks_version = 0;
    let mut cache = WauthJwksCache::new(300);
    let now = 1_700_000_000;

    let fetch = |url: &str, calls: &mut Vec<String>, jwks_version: &mut i32| -> Result<Value, String> {
        calls.push(url.to_string());
        if url.ends_with("/.well-known/aaif-wauth-configuration") {
            return Ok(json!({
                "issuer": "https://wauth.example",
                "jwks_uri": "https://wauth.example/jwks",
                "wauth_versions_supported": ["0.5.1"],
                "intent_versions_supported": ["0.2"],
                "profiles_supported": [],
                "formats_supported": ["jwt"],
                "mcp": {
                    "tool_namespaces_supported": ["aaif.wauth"],
                    "tools_supported": ["aaif.wauth.request"]
                }
            }));
        }

        *jwks_version += 1;
        if *jwks_version == 1 {
            return Ok(json!({ "keys": [{ "kid": "old", "kty": "RSA", "e": "AQAB", "n": "abc" }] }));
        }
        Ok(json!({ "keys": [{ "kid": "new", "kty": "RSA", "e": "AQAB", "n": "def" }] }))
    };

    let first = cache
        .get_for_issuer("https://wauth.example", now, false, |url| fetch(url, &mut calls, &mut jwks_version))
        .expect("failed to fetch initial JWKS");
    assert_eq!(first["keys"][0]["kid"], "old");
    assert_eq!(calls.len(), 2);

    let _cached = cache
        .get_for_issuer("https://wauth.example", now + 100, false, |url| {
            fetch(url, &mut calls, &mut jwks_version)
        })
        .expect("failed to fetch cached JWKS");
    assert_eq!(calls.len(), 2);

    let (_jwks, key) = cache
        .get_for_kid("https://wauth.example", "new", now + 100, |url| {
            fetch(url, &mut calls, &mut jwks_version)
        })
        .expect("failed to refresh JWKS for missing kid");
    assert_eq!(key.and_then(|k| k.get("kid").and_then(Value::as_str).map(str::to_string)), Some("new".to_string()));
    assert_eq!(calls.len(), 4);
}

#[test]
fn well_known_url() {
    assert_eq!(
        well_known_wauth_config_url("https://issuer.example/"),
        "https://issuer.example/.well-known/aaif-wauth-configuration"
    );
}

#[test]
fn schema_validation() {
    let schema = load_json("schemas/wauth-agent-link.v0.1.schema.json");
    let example = load_json("examples/agent-link-example.json");
    assert!(validate_against_schema(&schema, &example).is_ok());

    let invalid = json!({ "relation": "peer" });
    assert!(validate_against_schema(&schema, &invalid).is_err());
}
