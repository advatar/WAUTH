import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

import jwt
from jwt import InvalidTokenError


@dataclass
class JwtVerificationResult:
    ok: bool
    errors: List[str]
    header: Optional[Dict[str, Any]]
    claims: Optional[Dict[str, Any]]
    replay_key: Optional[str]


def decode_jwt_header(token: str) -> Dict[str, Any]:
    return jwt.get_unverified_header(token)


def decode_jwt_payload(token: str) -> Dict[str, Any]:
    payload = jwt.decode(
        token,
        options={
            "verify_signature": False,
            "verify_exp": False,
            "verify_iat": False,
            "verify_nbf": False,
            "verify_aud": False,
            "verify_iss": False,
        },
        algorithms=["RS256", "ES256", "EdDSA"],
    )
    if not isinstance(payload, dict):
        raise ValueError("JWT payload must be an object")
    return payload


def _select_jwk(jwks: Dict[str, Any], kid: Optional[str]) -> Optional[Dict[str, Any]]:
    keys = jwks.get("keys")
    if not isinstance(keys, list):
        return None

    dict_keys = [k for k in keys if isinstance(k, dict)]
    if kid:
        for key in dict_keys:
            if key.get("kid") == kid:
                return key
        return None

    if len(dict_keys) == 1:
        return dict_keys[0]
    return None


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


def verify_jwt_with_jwks(
    token: str,
    jwks: Dict[str, Any],
    expected_issuer: Optional[str] = None,
    expected_audience: Optional[str] = None,
    expected_subject: Optional[str] = None,
    now_epoch_seconds: Optional[int] = None,
    clock_tolerance_seconds: int = 120,
    allowed_algorithms: Optional[Sequence[str]] = None,
    expected_action_hash: Optional[str] = None,
    require_jti: bool = True,
) -> JwtVerificationResult:
    try:
        header = decode_jwt_header(token)
    except InvalidTokenError as exc:
        return JwtVerificationResult(
            ok=False,
            errors=[f"invalid JWT protected header: {exc}"],
            header=None,
            claims=None,
            replay_key=None,
        )

    kid = header.get("kid") if isinstance(header.get("kid"), str) else None
    jwk = _select_jwk(jwks, kid)
    if not jwk:
        return JwtVerificationResult(
            ok=False,
            errors=["no matching JWK found for token"],
            header=header,
            claims=None,
            replay_key=None,
        )

    algorithms = list(allowed_algorithms or ["RS256", "ES256", "EdDSA"])
    token_alg = header.get("alg") if isinstance(header.get("alg"), str) else None
    if token_alg not in algorithms:
        return JwtVerificationResult(
            ok=False,
            errors=[f"token algorithm not allowed: {token_alg}"],
            header=header,
            claims=None,
            replay_key=None,
        )

    try:
        key_obj = jwt.PyJWK.from_dict(jwk).key
        claims = jwt.decode(
            token,
            key=key_obj,
            algorithms=algorithms,
            audience=expected_audience,
            issuer=expected_issuer,
            options={
                "verify_signature": True,
                "verify_exp": False,
                "verify_iat": False,
                "verify_nbf": False,
                "verify_aud": expected_audience is not None,
                "verify_iss": expected_issuer is not None,
            },
        )
    except InvalidTokenError as exc:
        return JwtVerificationResult(
            ok=False,
            errors=[f"JWT verification failed: {exc}"],
            header=header,
            claims=None,
            replay_key=None,
        )

    if not isinstance(claims, dict):
        return JwtVerificationResult(
            ok=False,
            errors=["JWT payload must be an object"],
            header=header,
            claims=None,
            replay_key=None,
        )

    now = int(now_epoch_seconds if now_epoch_seconds is not None else time.time())
    errors: List[str] = []

    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or exp < (now - clock_tolerance_seconds):
        errors.append("token expired")

    iat = claims.get("iat")
    if not isinstance(iat, (int, float)) or iat > (now + clock_tolerance_seconds):
        errors.append("issued-at is in the future beyond skew")

    if expected_subject is not None and claims.get("sub") != expected_subject:
        errors.append("subject mismatch")

    action_hash = _extract_action_hash(claims)
    if expected_action_hash is not None and action_hash != expected_action_hash:
        errors.append("action hash mismatch")

    jti = claims.get("jti") if isinstance(claims.get("jti"), str) else None
    if require_jti and not jti:
        errors.append("missing jti for replay protection")

    return JwtVerificationResult(
        ok=len(errors) == 0,
        errors=errors,
        header=header,
        claims=claims,
        replay_key=jti,
    )
