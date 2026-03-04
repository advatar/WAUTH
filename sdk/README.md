# WAUTH SDK Workspace

This directory contains the first implementation slice for multi-language WAUTH SDKs.

## Packages

- `wauth-conformance` - shared conformance manifest and test vector mapping.
- `wauth-ts` - TypeScript reference SDK.
- `wauth-py` - Python SDK.
- `wauth-rs` - Rust SDK.

## Current scope (steps 1-3)

- Deterministic action canonicalization and `action_hash` generation.
- Envelope monotonicity checks (subset/narrowing semantics).
- Core profile rule evaluators backed by repository vectors.
- Cross-language tests against `/test_vectors`.
- MCP request + elicitation helpers.
- Extended MCP helper APIs for `aaif.wauth.get` and `aaif.wauth.metadata`.
- RP claim-level capability checks (`aud`, `exp`, `iat`, `jti`, `action_hash`).
- JWT/JWKS signature verification helpers for RP-CORE and discovery.
- Discovery URL helper for WAUTH well-known configuration.
- JSON Schema validation helpers.

## Next scope (step 4)

- Full schema conformance matrix (all schema/example pairs and negative cases).
- JWKS fetch + cache policies and key rotation handling helpers.
- Optional OpenID4VCI/VP helper layer.
