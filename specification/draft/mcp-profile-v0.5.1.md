# AAIF Wallet Authorization Protocol (WAuth) over MCP v0.5.1 (Profile)

**Status:** Draft  
**Version:** 0.5.1  
**Tool namespaces:** `aaif.wauth.*` (canonical), `aaif.pwma.*` (legacy alias)

## 1. Summary

This profile standardizes how a **Wallet Authorization Service (WAS)** is exposed as an **MCP Server**.

- Canonical tool namespace: `aaif.wauth.*`
- Legacy alias namespace: `aaif.pwma.*` (identical semantics)

An MCP Host/Client (agent runtime) can:

- request mandates and per-action capabilities,
- ingest credentials using OpenID4VCI offers (optional),
- present credentials using OpenID4VP requests (optional),
- trigger step-up approvals via HAPP (URL/QR-mode elicitations),
- upsert agent identity and attestation evidence (optional),
- record lifecycle, provenance, and risk-signal facts (optional),
- carry requester-context, instruction-source, execution-budget, postcondition, and multi-agent link facts (optional),
- retrieve stored artifacts and receipts by reference,
- optionally fetch discovery metadata (WAUTH-CONFIG).

This profile uses:

- MCP `tools/list` for discovery,
- MCP `tools/call` for invocation,
- URL-mode and QR-mode elicitations for sensitive user interactions.

## 2. Required capabilities

### 2.1 WAS MCP Server

A conforming WAS MCP server:

- MUST implement MCP tools.
- MUST expose tool `aaif.wauth.request` (or legacy alias `aaif.pwma.request`).
- SHOULD expose tool `aaif.wauth.get` to fetch artifacts by reference.
- MAY expose tool `aaif.wauth.metadata` to return WAUTH-CONFIG inline.

### 2.2 MCP Host/Client

A conforming MCP host/client:

- MUST support displaying QR code payloads provided by tool errors (QR-mode elicitation).
- MUST support safe navigation to provider/issuer-controlled UI (URL-mode elicitation), including:
  - clear domain display,
  - explicit user confirmation before navigation.

## 3. Tool: `aaif.wauth.request`

### 3.1 Purpose

Perform a wallet authorization operation (mandates, capabilities, OpenID4VCI, OpenID4VP) and return verifiable artifacts and/or elicitations when interaction is required.

### 3.2 Input arguments (logical model)

`aaif.wauth.request` MUST accept **exactly one** of the following request shapes:

A) **Intent Mode** (agent-initiated)

- `walletIntent` (WAUTH-INTENT; schema: `schemas/wauth-intent.v0.2.schema.json`)

B) **OpenID4VP Mode** (verifier request)

- `oid4vpRequest` (URL string or parsed object)
- optional execution hints:
  - `mode: "return" | "direct_post"`
  - when `direct_post`, include `response_uri` and any required metadata

C) **OpenID4VCI Mode** (issuer offer)

- `oid4vciOffer` (URL string or parsed offer object)

D) **HAPP forwarding** (advanced / optional)

- `happChallenge` (HAPP-CHAL object, if an RP provided one and the host wants the WAS to orchestrate)

E) **RP-REQSIG forwarding** (optional)

- `wauthRequired` (the RP’s `wauth_required` object; schema: `schemas/wauth-required.v0.2.schema.json`)
- optional `actionInstance` (profile-defined action object) to enable the WAS to enforce envelope and local policy before minting a capability

F) **Agent Identity Mode** (optional)

- `agentIdentity` (`schemas/wauth-agent-identity.v0.1.schema.json`)
- optional `attestation` (`schemas/wauth-attestation-evidence.v0.1.schema.json`)

G) **Lifecycle Event Mode** (optional)

- `lifecycleEvent` (`schemas/wauth-lifecycle-event.v0.1.schema.json`)

H) **Provenance Mode** (optional)

- `eventRecord` (`schemas/wauth-event.v0.1.schema.json`)

I) **Risk / Policy Evaluation Mode** (optional)

- `riskSignals` (`schemas/wauth-risk-signals.v0.1.schema.json`)
- optional `policyContext` (`schemas/wauth-policy-context.v0.2.schema.json`)

J) **Requester Context Mode** (optional)

- `requesterContext` (`schemas/wauth-requester-context.v0.1.schema.json`)

K) **Instruction Source Mode** (optional)

- `instructionSources` (array of `schemas/wauth-instruction-source.v0.1.schema.json`)

L) **Execution Budget / Postcondition Mode** (optional)

- `executionBudget` (`schemas/wauth-exec-budget.v0.1.schema.json`)
- `expectedPostcondition` (object, profile-defined)
- `postconditionReceipt` (`schemas/wauth-postcondition-receipt.v0.1.schema.json`)

M) **Multi-Agent Link Mode** (optional)

- `agentLinks` (array of `schemas/wauth-agent-link.v0.1.schema.json`)

All requests SHOULD include:

- `requestId` (string, stable across retries)
- `return` formatting preferences:
  - `artifacts.inline` boolean (default false for large artifacts)
  - `formatPreference` array (e.g., `["jwt","vc+json"]`)

### 3.3 Output

If the operation can complete without user interaction, the tool MUST return:

- `structuredContent` as a **WAUTH Result Envelope** (schema: `schemas/wauth-result-envelope.v0.1.schema.json`)

If user interaction is required, the WAS SHOULD return a JSON-RPC error:

- `code: -32042`
- `data.elicitations[]`

After the user completes the elicited step, the host SHOULD retry the tool call with the same `requestId`.

### 3.4 Elicitations

Elicitations MUST be represented as an array.

Each elicitation object MUST include:

- `elicitationId` (string)
- `mode` (`"url"` or `"qr"`)
- `message` (string)
- one of:
  - `url` (when mode `"url"`)
  - `qrPayload` (when mode `"qr"`)

Security notes:

- URL-mode elicitations MUST be hosted on the issuer/provider domain (not embedded forms).
- QR payloads SHOULD be treated as opaque; hosts MUST render as QR without interpretation.

### 3.5 Idempotency (RECOMMENDED)

WAS servers SHOULD be idempotent on `requestId`:

- repeating the same request after elicitation SHOULD produce the same result, or a stable reference to the same produced artifacts.

### 3.6 Errors

This profile defines the following error codes:

- `-32040` — policy denied (WAUTH-ERR-POLICY-DENY)
- `-32041` — malformed request / unsupported profile (WAUTH-ERR-BAD-REQUEST)
- `-32042` — user interaction required (WAUTH-ERR-ELICIT)
- `-32043` — external protocol error (issuer/verifier failure) (WAUTH-ERR-UPSTREAM)
- `-32044` — store locked / unlock required (WAUTH-ERR-STORE-LOCKED)
- `-32045` — attestation required or stale (WAUTH-ERR-ATTESTATION)
- `-32046` — lifecycle state blocks operation (WAUTH-ERR-LIFECYCLE)
- `-32047` — risk context insufficient or too risky (WAUTH-ERR-RISK)
- `-32048` — requester identity insufficient or continuity broken (WAUTH-ERR-REQUESTER)
- `-32049` — instruction source untrusted for requested authority (WAUTH-ERR-INSTRUCTION)
- `-32050` — execution budget missing, stale, or exceeded (WAUTH-ERR-BUDGET)
- `-32051` — required postcondition not met or unverified (WAUTH-ERR-POSTCONDITION)
- `-32052` — multi-agent trust requirements not satisfied (WAUTH-ERR-MULTI-AGENT)

## 4. Tool: `aaif.wauth.get` (optional)

### 4.1 Purpose

Retrieve an artifact by reference when the artifact is too large to return inline (e.g., VP tokens, receipts, credential blobs).

### 4.2 Input arguments

- `ref` (string)

### 4.3 Output

- `structuredContent` containing the referenced artifact, in the same envelope format used for artifacts in the WAUTH Result Envelope.

## 5. Tool: `aaif.wauth.metadata` (optional)

### 5.1 Purpose

Return the discovery document (WAUTH-CONFIG) to an MCP host without requiring an extra HTTP fetch.

### 5.2 Output

- `structuredContent` containing the WAUTH-CONFIG object (schema: `schemas/wauth-metadata.v0.4.schema.json`)

If implemented, this tool’s result MUST be semantically identical to the JSON served at:

- `/.well-known/aaif-wauth-configuration`

## 6. Notes

- Requester context, instruction source integrity, and execution budgets are **optional profile inputs**. They do not change the core mandate/capability model, but claimed profiles may require them to be forwarded or enforced.

- Sensitive interactions (issuer login, biometrics, enterprise authentication) MUST occur on issuer/provider domains via URL-mode.
- The WAS SHOULD minimize disclosures by default and enforce local policy regardless of host hints.
- The WAS SHOULD support OpenID4VP `direct_post` where feasible.
- Hosts SHOULD be able to forward provenance and risk facts without expanding raw prompt content when hashes or references suffice.
- If a WAS requests agent identity or attestation evidence, hosts SHOULD preserve stable IDs and task-scoped IDs separately.
- Lifecycle events that suspend or revoke an agent SHOULD be forwarded promptly so the WAS can block new capabilities.