# WAUTH Demo (TypeScript)

Runnable implementation of the backlog storyline using the TypeScript SDK.

## Includes

- MCP wallet tool surface:
  - `aaif.wauth.request`
  - `aaif.wauth.get`
  - `aaif.wauth.metadata`
- ChatGPT tax workflow tool surface:
  - `aaif.demo.tax.file`
  - `aaif.demo.tax.status`
  - `aaif.demo.tax.pending_approvals`
  - `aaif.demo.tax.approve`
  - `aaif.demo.tax.timeline`
  - `aaif.demo.tax.reset`
- WAS capability issuance with request-id idempotency.
- Persistent state for tax workflows and WAUTH request/artifact issuance.
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

## Run MCP server (for ChatGPT)

```sh
cd demo/wauth-demo-ts
npm install
npm run serve:mcp
```

Server endpoints:
- `POST /mcp` (MCP Streamable HTTP)
- `GET /healthz`
- `GET /.well-known/aaif-wauth-configuration`
- `GET /jwks`
- `GET /iproov/approve` (approval UI shown by URL elicitation)

### ChatGPT tool flow

Register the MCP endpoint in your ChatGPT app, then in chat use:
- `please file my taxes`

The model should call `aaif.demo.tax.file` and run automatically until approval is required.
When iProov approval is needed, the tool raises MCP URL elicitation (`-32042`) with an approval URL.
Open that URL and click approve. The server auto-advances to the next gate or completion.
If your client does not auto-resume tool execution, call `aaif.demo.tax.file` again.

Useful tools:
- `aaif.demo.tax.file`
- `aaif.demo.tax.approve`
- `aaif.demo.tax.pending_approvals`
- `aaif.demo.tax.status`
- `aaif.demo.tax.timeline`
- `aaif.demo.tax.reset`
- `aaif.wauth.request`
- `aaif.wauth.get`
- `aaif.wauth.metadata`

## Build static demo page

```sh
cd demo/wauth-demo-ts
npm install
npm run build:static
```

The static output is written to `dist/`:
- `dist/index.html`
- `dist/result.json`
