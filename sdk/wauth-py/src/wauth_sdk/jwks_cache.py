from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Tuple

from .discovery import well_known_wauth_config_url


@dataclass
class CachedJwks:
    jwks: Dict[str, Any]
    fetched_at_epoch_seconds: int
    expires_at_epoch_seconds: int


class WauthJwksCache:
    def __init__(
        self,
        fetch_json: Callable[[str], Dict[str, Any]],
        ttl_seconds: int = 300,
        now_epoch_seconds: Optional[Callable[[], int]] = None,
    ) -> None:
        self._fetch_json = fetch_json
        self._ttl_seconds = ttl_seconds
        self._now_epoch_seconds = now_epoch_seconds or __import__("time").time
        self._cache: Dict[str, CachedJwks] = {}

    def _now(self) -> int:
        return int(self._now_epoch_seconds())

    def fetch_metadata(self, issuer: str) -> Dict[str, Any]:
        metadata = self._fetch_json(well_known_wauth_config_url(issuer))
        if not isinstance(metadata, dict):
            raise ValueError("invalid WAUTH metadata payload")
        if not isinstance(metadata.get("issuer"), str) or not isinstance(metadata.get("jwks_uri"), str):
            raise ValueError("invalid WAUTH metadata payload")
        return metadata

    def fetch_jwks_from_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        jwks = self._fetch_json(metadata["jwks_uri"])
        if not isinstance(jwks, dict) or not isinstance(jwks.get("keys"), list):
            raise ValueError("invalid JWKS payload")
        return jwks

    def get_for_issuer(self, issuer: str, force_refresh: bool = False) -> Dict[str, Any]:
        now = self._now()
        existing = self._cache.get(issuer)
        if not force_refresh and existing and existing.expires_at_epoch_seconds > now:
            return existing.jwks

        metadata = self.fetch_metadata(issuer)
        jwks = self.fetch_jwks_from_metadata(metadata)
        self._cache[issuer] = CachedJwks(
            jwks=jwks,
            fetched_at_epoch_seconds=now,
            expires_at_epoch_seconds=now + self._ttl_seconds,
        )
        return jwks

    def get_for_kid(self, issuer: str, kid: str) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
        jwks = self.get_for_issuer(issuer)
        key = self._find_key(jwks, kid)
        if key is not None:
            return jwks, key

        jwks = self.get_for_issuer(issuer, force_refresh=True)
        key = self._find_key(jwks, kid)
        return jwks, key

    @staticmethod
    def _find_key(jwks: Dict[str, Any], kid: str) -> Optional[Dict[str, Any]]:
        keys = jwks.get("keys")
        if not isinstance(keys, list):
            return None
        for key in keys:
            if isinstance(key, dict) and key.get("kid") == kid:
                return key
        return None

    def clear(self, issuer: Optional[str] = None) -> None:
        if issuer is None:
            self._cache.clear()
        else:
            self._cache.pop(issuer, None)
