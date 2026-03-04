from typing import Any, List, Tuple

from .jcs import canonicalize_jcs


def _deep_equal(a: Any, b: Any) -> bool:
    return canonicalize_jcs(a) == canonicalize_jcs(b)


def _is_subset_array(parent: List[Any], child: List[Any]) -> bool:
    return all(any(_deep_equal(c, p) for p in parent) for c in child)


def _compare_constraint(path: str, parent: Any, child: Any, reasons: List[str]) -> None:
    if parent is None or isinstance(parent, (str, bool)):
        if not _deep_equal(parent, child):
            reasons.append(f"{path}: value differs")
        return

    if isinstance(parent, (int, float)):
        if not isinstance(child, (int, float)) or child != parent:
            reasons.append(f"{path}: numeric value differs")
        return

    if isinstance(parent, list):
        if not isinstance(child, list) or not _is_subset_array(parent, child):
            reasons.append(f"{path}: child list must be subset of parent list")
        return

    if not isinstance(parent, dict) or not isinstance(child, dict):
        reasons.append(f"{path}: incompatible structures")
        return

    for key, pval in parent.items():
        if key not in child:
            reasons.append(f"{path}.{key}: missing in child")
            continue

        cval = child[key]

        if key in ("max", "le"):
            if not isinstance(pval, (int, float)) or not isinstance(cval, (int, float)) or cval > pval:
                reasons.append(f"{path}.{key}: child must be <= parent")
            continue

        if key in ("min", "ge"):
            if not isinstance(pval, (int, float)) or not isinstance(cval, (int, float)) or cval < pval:
                reasons.append(f"{path}.{key}: child must be >= parent")
            continue

        if key == "in":
            if not isinstance(pval, list) or not isinstance(cval, list) or not _is_subset_array(pval, cval):
                reasons.append(f"{path}.{key}: child set must be subset of parent set")
            continue

        if key == "currency":
            if not isinstance(pval, str) or not isinstance(cval, str) or pval.lower() != cval.lower():
                reasons.append(f"{path}.{key}: currency must match")
            continue

        _compare_constraint(f"{path}.{key}", pval, cval, reasons)


def check_envelope_monotonicity(parent: Any, child: Any) -> Tuple[bool, List[str]]:
    reasons: List[str] = []

    if not isinstance(parent, dict) or not isinstance(child, dict):
        return False, ["parent and child envelopes must be objects"]

    if isinstance(parent.get("version"), str) and isinstance(child.get("version"), str):
        if parent["version"] != child["version"]:
            reasons.append("version mismatch")

    parent_constraints = parent.get("constraints")
    child_constraints = child.get("constraints")
    if not isinstance(parent_constraints, dict) or not isinstance(child_constraints, dict):
        reasons.append("constraints must be objects")
    else:
        for key, pconstraint in parent_constraints.items():
            if key not in child_constraints:
                reasons.append(f"constraints.{key}: missing in child")
                continue
            _compare_constraint(f"constraints.{key}", pconstraint, child_constraints[key], reasons)

    return len(reasons) == 0, reasons
