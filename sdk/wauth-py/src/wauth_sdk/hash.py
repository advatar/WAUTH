import base64
import hashlib
from typing import Any

from .jcs import canonicalize_jcs


def compute_action_hash(action_instance: Any) -> str:
    canonical = canonicalize_jcs(action_instance).encode("utf-8")
    digest = hashlib.sha256(canonical).digest()
    b64 = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return f"sha256:{b64}"
