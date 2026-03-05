# @aaif/wauth-ts

TypeScript WAUTH SDK (initial slice).

## Implemented

- RFC 8785-style canonical JSON serialization for action hashing.
- `sha256:<base64url>` action hash generation.
- Envelope monotonicity validation helper.
- Rule evaluators for v0.5 profile vectors.
- MCP helper functions (`aaif.wauth.request`, `aaif.wauth.get`, `aaif.wauth.metadata`) plus envelope/metadata parsers.
- RP helper for claim-level capability checks (`aud`, `exp`, `iat`, `jti`, `action_hash`).
- JWT/JWKS signature verification helper with issuer/audience/alg checks.
- DPoP helper layer for sender-constrained requests:
  - proof creation (`createDpopProof`)
  - proof verification (`verifyDpopProof`)
  - capability + DPoP combined verification (`verifyCapabilityRequestWithDpop`)
  - `cnf.jkt` extraction (`extractConfirmationJkt`)
  - replay helper (`InMemoryReplayGuard`)
- JWKS discovery cache helper with TTL and key-rotation refresh behavior.
- Discovery helper for `/.well-known/aaif-wauth-configuration` URL derivation.
- JSON Schema validation registry with local/offline schema resolution.
- Test-vector-driven conformance tests.

## Usage

```ts
import { computeActionHash } from "@aaif/wauth-ts";

const actionHash = computeActionHash({
  profile: "aaif.wauth.action.commerce.checkout_complete/v0.1",
  checkout_id: "chk_123",
  merchant: "did:web:merchant.example",
  currency: "USD",
  total_amount_minor: 99900
});
```
