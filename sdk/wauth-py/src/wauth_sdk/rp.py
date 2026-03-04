from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from .jwt_verify import verify_jwt_with_jwks


@dataclass
class CapabilityValidationResult:
    ok: bool
    errors: List[str]
    replay_key: Optional[str]


@dataclass
class CapabilityJwtVerificationResult(CapabilityValidationResult):
    claims: Optional[Dict[str, Any]]
    header: Optional[Dict[str, Any]]


def _audience_includes(aud_claim: Any, expected_audience: str) -> bool:
    if isinstance(aud_claim, str):
        return aud_claim == expected_audience
    if isinstance(aud_claim, list):
        return any(v == expected_audience for v in aud_claim)
    return False


def _extract_action_hash(claims: Dict[str, Any]) -> Optional[str]:
    action_hash = claims.get("action_hash")
    if isinstance(action_hash, str):
        return action_hash

    authorization_details = claims.get("authorization_details")
    if not isinstance(authorization_details, list):
        return None

    for detail in authorization_details:
        if isinstance(detail, dict) and isinstance(detail.get("action_hash"), str):
            return detail["action_hash"]

    return None


def validate_capability_claims(
    claims: Dict[str, Any],
    expected_audience: str,
    expected_action_hash: str,
    now_epoch_seconds: int,
    max_clock_skew_seconds: int = 120,
) -> CapabilityValidationResult:
    errors: List[str] = []

    if not _audience_includes(claims.get("aud"), expected_audience):
        errors.append("audience mismatch")

    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or exp < (now_epoch_seconds - max_clock_skew_seconds):
        errors.append("token expired")

    iat = claims.get("iat")
    if not isinstance(iat, (int, float)) or iat > (now_epoch_seconds + max_clock_skew_seconds):
        errors.append("issued-at is in the future beyond skew")

    action_hash = _extract_action_hash(claims)
    if action_hash != expected_action_hash:
        errors.append("action hash mismatch")

    jti = claims.get("jti")
    if not isinstance(jti, str) or len(jti) == 0:
        errors.append("missing jti for replay protection")

    return CapabilityValidationResult(
        ok=len(errors) == 0,
        errors=errors,
        replay_key=jti if isinstance(jti, str) else None,
    )


def verify_capability_jwt_with_jwks(
    token: str,
    jwks: Dict[str, Any],
    expected_audience: str,
    expected_action_hash: str,
    expected_issuer: Optional[str] = None,
    now_epoch_seconds: Optional[int] = None,
    max_clock_skew_seconds: int = 120,
    allowed_algorithms: Optional[Sequence[str]] = None,
) -> CapabilityJwtVerificationResult:
    jwt_result = verify_jwt_with_jwks(
        token=token,
        jwks=jwks,
        expected_issuer=expected_issuer,
        expected_audience=expected_audience,
        now_epoch_seconds=now_epoch_seconds,
        clock_tolerance_seconds=max_clock_skew_seconds,
        allowed_algorithms=allowed_algorithms,
        expected_action_hash=expected_action_hash,
        require_jti=True,
    )

    if not jwt_result.ok or jwt_result.claims is None:
        return CapabilityJwtVerificationResult(
            ok=False,
            errors=jwt_result.errors,
            replay_key=jwt_result.replay_key,
            claims=jwt_result.claims,
            header=jwt_result.header,
        )

    now = now_epoch_seconds if now_epoch_seconds is not None else 0
    if now == 0:
        # keep deterministic runtime behavior delegated to verify_jwt_with_jwks when no explicit clock is passed
        import time as _time

        now = int(_time.time())

    claims_result = validate_capability_claims(
        claims=jwt_result.claims,
        expected_audience=expected_audience,
        expected_action_hash=expected_action_hash,
        now_epoch_seconds=now,
        max_clock_skew_seconds=max_clock_skew_seconds,
    )

    return CapabilityJwtVerificationResult(
        ok=jwt_result.ok and claims_result.ok,
        errors=[*jwt_result.errors, *claims_result.errors],
        replay_key=claims_result.replay_key or jwt_result.replay_key,
        claims=jwt_result.claims,
        header=jwt_result.header,
    )
