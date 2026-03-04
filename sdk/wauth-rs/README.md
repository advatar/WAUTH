# wauth-rs

Rust WAUTH SDK (initial slice).

## Implemented

- Deterministic JSON canonicalization for action hashing.
- `sha256:<base64url>` action hash generation.
- Envelope monotonicity validation helper.
- Rule evaluators for v0.5 profile vectors.
- MCP helper functions (`aaif.wauth.request`, `aaif.wauth.get`, `aaif.wauth.metadata`) plus envelope/metadata parsers.
- RP helper for claim-level capability checks (`aud`, `exp`, `iat`, `jti`, `action_hash`).
- JWT/JWKS signature verification helper with issuer/audience/alg checks.
- JWKS discovery cache helper with TTL and key-rotation refresh behavior.
- Discovery helper for `/.well-known/aaif-wauth-configuration` URL derivation.
- JSON Schema validation helper for locally-resolved schemas.
- Vector-driven cargo tests.
