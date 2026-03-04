from typing import Any, Dict, List, Optional


def _resolve_namespace(namespace: Optional[str]) -> str:
    return namespace or "aaif.wauth"


def _resolve_structured_content(tool_result: Any) -> Any:
    if isinstance(tool_result, dict) and "structuredContent" in tool_result:
        return tool_result["structuredContent"]
    return tool_result


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


def build_wauth_get(ref: str, namespace: Optional[str] = None) -> Dict[str, Any]:
    return {
        "name": f"{_resolve_namespace(namespace)}.get",
        "arguments": {"ref": ref},
    }


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

    return content
