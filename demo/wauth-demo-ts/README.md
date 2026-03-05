# WAUTH Demo (TypeScript)

Runnable in-memory implementation of the backlog storyline using the TypeScript SDK.

## Includes

- MCP wallet tool surface:
  - `aaif.wauth.request`
  - `aaif.wauth.get`
  - `aaif.wauth.metadata`
- WAS capability issuance with request-id idempotency.
- Mock Bank, Employer, and IRS relying parties with:
  - `wauth_required` runtime denials
  - capability JWT verification
  - DPoP sender-constraint verification
  - replay protection
- Deterministic end-to-end tax scenario runner with timeline and receipts.

## Run tests

```sh
cd demo/wauth-demo-ts
npm install
npm test
```

## Run scenario

```sh
cd demo/wauth-demo-ts
npm install
npm run demo
```
