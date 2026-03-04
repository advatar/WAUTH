import json
import math
from typing import Any


def canonicalize_jcs(value: Any) -> str:
    if value is None:
        return "null"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, int):
        return str(value)

    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("JCS does not allow non-finite numbers")
        if value == 0:
            return "0"
        return json.dumps(value, separators=(",", ":"), allow_nan=False)

    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    if isinstance(value, list):
        return "[" + ",".join(canonicalize_jcs(v) for v in value) + "]"

    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: kv[0])
        encoded = []
        for key, v in items:
            key_json = json.dumps(key, ensure_ascii=False, separators=(",", ":"))
            encoded.append(f"{key_json}:{canonicalize_jcs(v)}")
        return "{" + ",".join(encoded) + "}"

    raise TypeError("Unsupported JSON value")
