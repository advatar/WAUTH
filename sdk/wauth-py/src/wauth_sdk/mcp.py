from typing import Any, Dict, List, Optional


def _resolve_namespace(namespace: Optional[str]) -> str:
    return namespace or "aaif.wauth"


def _resolve_structured_content(tool_result: Any) -> Any:
    if isinstance(tool_result, dict) and "structuredContent" in tool_result:
        return tool_result["structuredContent"]
    return tool_result


def _is_str_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(entry, str) for entry in value)


def build_wauth_request(
    args: Dict[str, Any],
    request_id: Optional[str] = None,
    namespace: Optional[str] = None,
) -> Dict[str, Any]:
    out_args = dict(args)
    if request_id:
        out_args["requestId"] = request_id
    return {
        "name": f"{_resolve_namespace(namespace)}.request",
        "arguments": out_args,
    }


def build_wauth_oid4vp_request(
    oid4vp_request: Any,
    mode: Optional[str] = None,
    response_uri: Optional[str] = None,
    request_id: Optional[str] = None,
    namespace: Optional[str] = None,
) -> Dict[str, Any]:
    args: Dict[str, Any] = {"oid4vpRequest": oid4vp_request}
    if mode is not None:
        args["mode"] = mode
    if response_uri is not None:
        args["response_uri"] = response_uri
    return build_wauth_request(args, request_id=request_id, namespace=namespace)


def build_wauth_oid4vci_request(
    oid4vci_offer: Any,
    request_id: Optional[str] = None,
    namespace: Optional[str] = None,
) -> Dict[str, Any]:
    return build_wauth_request(
        {"oid4vciOffer": oid4vci_offer},
        request_id=request_id,
        namespace=namespace,
    )


def build_wauth_reqsig_forwarding_request(
    wauth_required: Dict[str, Any],
    action_instance: Optional[Any] = None,
    request_id: Optional[str] = None,
    namespace: Optional[str] = None,
) -> Dict[str, Any]:
    args: Dict[str, Any] = {"wauthRequired": wauth_required}
    if action_instance is not None:
        args["actionInstance"] = action_instance
    return build_wauth_request(args, request_id=request_id, namespace=namespace)


def build_wauth_get(ref: str, namespace: Optional[str] = None) -> Dict[str, Any]:
    return {
        "name": f"{_resolve_namespace(namespace)}.get",
        "arguments": {"ref": ref},
    }


def build_wauth_get_from_artifact(
    artifact: Dict[str, Any],
    namespace: Optional[str] = None,
) -> Dict[str, Any]:
    ref = artifact.get("ref")
    if not isinstance(ref, str) or len(ref) == 0:
        raise ValueError("WAUTH artifact must include a non-empty ref")
    return build_wauth_get(ref, namespace=namespace)


def build_wauth_metadata(namespace: Optional[str] = None) -> Dict[str, Any]:
    return {
        "name": f"{_resolve_namespace(namespace)}.metadata",
        "arguments": {},
    }


def extract_elicitations(error_payload: Any) -> List[Any]:
    if not isinstance(error_payload, dict):
        return []
    data = error_payload.get("data")
    if not isinstance(data, dict):
        return []
    elicitations = data.get("elicitations")
    if isinstance(elicitations, list):
        return elicitations
    return []


def parse_wauth_result_envelope(tool_result: Any) -> Dict[str, Any]:
    content = _resolve_structured_content(tool_result)
    if not isinstance(content, dict):
        raise ValueError("WAUTH result envelope must be a JSON object")

    if not isinstance(content.get("version"), str) or not isinstance(content.get("requestId"), str):
        raise ValueError("WAUTH result envelope missing required fields: version/requestId")

    return content


def parse_wauth_get_artifact(
    tool_result: Any,
    expected_kind: Optional[str] = None,
    expected_format: Optional[str] = None,
) -> Dict[str, Any]:
    content = _resolve_structured_content(tool_result)
    if not isinstance(content, dict):
        raise ValueError("WAUTH get response must be a JSON object")

    kind = content.get("kind")
    fmt = content.get("format")
    if not isinstance(kind, str) or not isinstance(fmt, str):
        raise ValueError("WAUTH get response missing required fields: kind/format")

    has_inline = "inline" in content
    has_ref = isinstance(content.get("ref"), str) and len(content["ref"]) > 0
    if not has_inline and not has_ref:
        raise ValueError("WAUTH get response must include inline or ref")

    if expected_kind is not None and kind != expected_kind:
        raise ValueError(f"WAUTH get response kind mismatch: expected {expected_kind}")
    if expected_format is not None and fmt != expected_format:
        raise ValueError(f"WAUTH get response format mismatch: expected {expected_format}")

    return content


def extract_artifact_refs(result_envelope: Dict[str, Any]) -> List[str]:
    artifacts = result_envelope.get("artifacts")
    if not isinstance(artifacts, list):
        return []

    refs: List[str] = []
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        ref = artifact.get("ref")
        if isinstance(ref, str) and len(ref) > 0:
            refs.append(ref)
    return refs


def parse_wauth_metadata(tool_result: Any) -> Dict[str, Any]:
    content = _resolve_structured_content(tool_result)
    if not isinstance(content, dict):
        raise ValueError("WAUTH metadata response must be a JSON object")

    if not isinstance(content.get("issuer"), str):
        raise ValueError("WAUTH metadata missing required field: issuer")
    if not isinstance(content.get("jwks_uri"), str):
        raise ValueError("WAUTH metadata missing required field: jwks_uri")
    if not _is_str_list(content.get("wauth_versions_supported")):
        raise ValueError("WAUTH metadata missing required string array: wauth_versions_supported")
    if not _is_str_list(content.get("intent_versions_supported")):
        raise ValueError("WAUTH metadata missing required string array: intent_versions_supported")
    if not _is_str_list(content.get("profiles_supported")):
        raise ValueError("WAUTH metadata missing required string array: profiles_supported")
    if not _is_str_list(content.get("formats_supported")):
        raise ValueError("WAUTH metadata missing required string array: formats_supported")

    mcp = content.get("mcp")
    if not isinstance(mcp, dict):
        raise ValueError("WAUTH metadata missing required field: mcp")
    if not _is_str_list(mcp.get("tool_namespaces_supported")):
        raise ValueError("WAUTH metadata missing required string array: mcp.tool_namespaces_supported")
    if not _is_str_list(mcp.get("tools_supported")):
        raise ValueError("WAUTH metadata missing required string array: mcp.tools_supported")

    return content


def metadata_supports_tool(metadata: Dict[str, Any], tool_name: str) -> bool:
    mcp = metadata.get("mcp")
    if not isinstance(mcp, dict):
        return False
    tools = mcp.get("tools_supported")
    return isinstance(tools, list) and tool_name in tools


def metadata_supports_namespace(metadata: Dict[str, Any], namespace: str) -> bool:
    mcp = metadata.get("mcp")
    if not isinstance(mcp, dict):
        return False
    namespaces = mcp.get("tool_namespaces_supported")
    return isinstance(namespaces, list) and namespace in namespaces


def metadata_supports_profile(metadata: Dict[str, Any], profile: str) -> bool:
    profiles = metadata.get("profiles_supported")
    return isinstance(profiles, list) and profile in profiles


def metadata_supports_format(metadata: Dict[str, Any], fmt: str) -> bool:
    formats = metadata.get("formats_supported")
    return isinstance(formats, list) and fmt in formats


def metadata_supports_wauth_version(metadata: Dict[str, Any], version: str) -> bool:
    versions = metadata.get("wauth_versions_supported")
    return isinstance(versions, list) and version in versions
