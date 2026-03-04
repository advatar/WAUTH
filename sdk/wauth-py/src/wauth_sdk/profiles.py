from typing import Any, Dict, List


def _as_dict(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Expected object")
    return value


def evaluate_requester_continuity(value: Any) -> str:
    data = _as_dict(value)
    return "allow" if data.get("continuity") == "intact" else "step_up_or_deny"


def evaluate_instruction_source(value: Any) -> str:
    data = _as_dict(value)
    if data.get("mutability") == "externally_editable" or data.get("review_state") != "reviewed":
        return "data"
    return "instruction"


def evaluate_execution_budget(value: Any) -> str:
    data = _as_dict(value)
    persistent_types = {"cron", "daemon", "monitor", "recurring_workflow"}
    if not data.get("may_create_persistent_process", True) and data.get("requested_process_type") in persistent_types:
        return "deny"
    return "allow"


def evaluate_postcondition(value: Any) -> str:
    data = _as_dict(value)
    claimed = data.get("claimed_success") is True
    verified = data.get("verified_success") is True
    if claimed and not verified:
        return "unverified_or_failed"
    if verified:
        return "verified"
    return "unknown"


def validate_provenance_chain(value: Any) -> bool:
    data = _as_dict(value)
    events = data.get("events")
    if not isinstance(events, list) or not events:
        return False

    for idx, raw_event in enumerate(events):
        event = _as_dict(raw_event)
        if idx == 0:
            if event.get("prev_event_hash") is not None:
                return False
            continue
        previous = _as_dict(events[idx - 1])
        if event.get("prev_event_hash") != previous.get("event_hash"):
            return False

    return True


def evaluate_risk_policy(value: Any) -> str:
    data = _as_dict(value)
    risk = _as_dict(data.get("risk", {}))
    return "wauth_required" if risk.get("recommended_action") == "step_up" else "permit"


def evaluate_multi_agent_trust(value: Any) -> str:
    data = _as_dict(value)
    independent = data.get("verified_independently") is True
    if not independent and data.get("assertion_basis") == "shared_channel":
        return "insufficient_without_external_anchor"
    return "sufficient"
