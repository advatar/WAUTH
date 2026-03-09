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
WAUTH_DEMO_ISSUER=http://127.0.0.1:3000 \
npm run serve:mcp
```

### Local HAPP mode

If the sibling repo `../AAIF/HAPP` is present, the demo server now defaults to `WAUTH_DEMO_HAPP_MODE=local-ref` and will spawn the local Rust `happd` reference provider on demand for browser approvals.

Recommended verification steps:

```sh
cd ../AAIF/HAPP/implementations/rust
cargo build -p happd
```

The approval landing page opens the provider-owned HAPP UI in a separate tab and polls until the local HAPP session is approved.

To force the legacy redirect-only handoff instead of the local sidecar, set:

```sh
WAUTH_DEMO_HAPP_MODE=handoff
```

Server endpoints:
- `GET /` (mock RP directory landing page)
- `POST /mcp` (MCP Streamable HTTP)
- `GET /bank` (mock bank landing page)
- `GET /hr` / `GET /employer` (mock HR system landing page)
- `GET /tax-office` / `GET /irs` (mock tax office landing page)
- `GET /bank/.well-known/oauth-protected-resource` and equivalent RP path variants
- `GET /bank/.well-known/wauth-requirements` and equivalent RP path variants
- `GET /healthz`
- `GET /.well-known/aaif-wauth-configuration`
- `GET /jwks`
- `GET /iproov/approve` (HAPP handoff page)
- Vercel/serverless aliases: `/api`, `/api/bank`, `/api/hr`, `/api/employer`, `/api/tax-office`, `/api/irs`, `/api/mcp`, `/api/healthz`, `/api/jwks`, `/api/iproov/approve`, and the matching `/api/.../.well-known/...` RP metadata routes

The RP landing pages are presentation-only surfaces that explain what each mocked RP protects and why WAUTH blocks the agent. The actual RP enforcement in the demo still happens in the in-memory scenario/runtime.

### Deploy to Vercel

```sh
cd demo/wauth-demo-ts
npx vercel --prod
```

Set environment variable in Vercel project:
- `WAUTH_DEMO_ISSUER=https://wauth-demo.showntell.dev/api`
- `WAUTH_DEMO_HAPP_BASE_URL=https://happ.showntell.dev`
- `WAUTH_DEMO_STATE_FILE=/tmp/wauth-demo/workflow-state.json`
- `WAUTH_DEMO_WAUTH_STATE_FILE=/tmp/wauth-demo/wauth-state.json`

Use MCP endpoint in ChatGPT:
- `https://wauth-demo.showntell.dev/api/mcp`

### ChatGPT tool flow

Register the MCP endpoint in your ChatGPT app, then in chat use:
- `please file my taxes`

The model should call `aaif.demo.tax.file` and run automatically until approval is required.
When iProov approval is needed, the tool raises MCP URL elicitation (`-32042`) with an approval URL.
Open that URL, launch the HAPP approval tab, complete the provider-side approval flow, and leave the original tab open. The landing page polls the HAPP session and auto-advances to the next gate or completion when approval is detected.
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
