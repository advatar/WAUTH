# AAIF Wallet Authorization Protocol (WAuth) — Conformance Requirements v0.5.0 (Draft)

**Status:** Draft  
**Version:** 0.5.0  
**Track:** AAIF Standards / MCP Profile

This document defines conformance requirements for:

- **WAS implementations** (Wallet Authorization Service over MCP),
- **MCP hosts/clients** (agent runtimes invoking MCP tools),
- **Relying Parties** (verifiers/executors of mandates/capabilities),
- Optional profiles including **RP Requirements Signaling** and **Protected Resource Metadata**.

Normative keywords are per BCP 14 (RFC 2119, RFC 8174).

---

## 0. Namespace and naming conformance

### 0.1 Tool namespaces

A conforming deployment MUST support at least one of the following MCP tool namespaces:

- Canonical: `aaif.wauth.*`
- Legacy alias: `aaif.pwma.*`

If a WAS exposes both, tool behaviors, errors, and outputs MUST be identical across namespaces.

A conforming WAS that claims discovery support MUST advertise namespaces in its well-known document (`mcp.tool_namespaces_supported`).

### 0.2 Artifact prefixes

A conforming WAS SHOULD emit artifacts using the canonical `WAUTH-` prefix.

For backwards compatibility, deployments MAY accept legacy `PWMA-` artifact prefixes as aliases when the underlying artifact type and version match.

---

## 1. Conformance classes

Implementations MAY claim one or more of the following classes.

### 1.1 Wallet Authorization Service (WAS)

- **WAS-CORE** — implements core artifacts and MCP tool surface.
- **WAS-DISCOVERY** — WAS-CORE plus `/.well-known/aaif-wauth-configuration` and JWKS.
- **WAS-AUTONOMY** — WAS-CORE plus mandates/capabilities with envelope monotonicity and action hashing.
- **WAS-OID4VC** — WAS-CORE plus OpenID4VCI/OpenID4VP bridging.
- **WAS-HAPP** — WAS-CORE plus HAPP step-up integration.
- **WAS-WORKLOAD-ID** — WAS-CORE plus WAUTH-AGENT and WAUTH-ATTEST support.
- **WAS-LIFECYCLE** — WAS-CORE plus lifecycle event handling and revocation propagation.
- **WAS-POLICY** — WAS-CORE plus policy context/decision interfaces.
- **WAS-PROVENANCE** — WAS-CORE plus WAUTH-EVT / WAUTH-REC chaining.
- **WAS-RISK** — WAS-CORE plus WAUTH-RISK handling.

### 1.2 Relying Party (RP)

- **RP-CORE** — verifies WAUTH-CAP and enforces envelope + action binding + replay controls.
- **RP-REQSIG** — RP-CORE plus WAUTH-RP-REQSIG runtime requirement signaling (`wauth_required`).
- **RP-PRM** — advertises WAUTH support via OAuth Protected Resource Metadata (RFC 9728) with WAUTH extension object.
- **RP-WORKLOAD-ID** — verifies workload identity / attestation requirements when demanded by policy.
- **RP-RISK** — consumes WAUTH-RISK or equivalent risk inputs in execution policy.

### 1.3 MCP Host/Client

- **MCP-CORE** — supports URL/QR elicitations and idempotent retries.
- **MCP-EVIDENCE** — forwards workload identity, risk, lifecycle, and provenance references when the WAS requires them.

---

## 2. WAS requirements

### 2.1 MCP tool surface

**WAS-MCP-01 (MUST):** Expose `aaif.wauth.request` (or legacy alias `aaif.pwma.request`).

**WAS-MCP-02 (SHOULD):** Expose `aaif.wauth.get` to fetch artifacts by reference.

**WAS-MCP-03 (MAY):** Expose `aaif.wauth.metadata` to return the discovery document inline.

Suggested tests:
- tool appears in `tools/list`
- request/response schemas validate

### 2.2 Deterministic hashing

**WAS-HASH-01 (MUST):** Implement RFC 8785 JCS for any hashed objects.

**WAS-HASH-02 (SHOULD):** Reject hashed objects that contain floats or other non-deterministic encodings.

Suggested tests:
- recompute hashes from published test vectors

### 2.3 Envelope handling

**WAS-ENV-01 (MUST):** Accept and validate WAUTH-ENVELOPE v0.2 objects.

**WAS-ENV-02 (MUST):** Enforce envelope monotonicity when issuing child mandates and capabilities.

**WAS-ENV-03 (MUST):** Enforce envelope constraints at capability mint time.

Suggested tests:
- child.max < parent.max => PASS
- child drops a parent key => FAIL
- allow-list not subset => FAIL

### 2.4 Mandates and subdelegation

**WAS-MAND-01 (MUST):** Support WAUTH-MANDATE in `format: jwt`.

**WAS-MAND-02 (MUST):** Enforce monotonicity on `scope`, `aud`, `exp`, and `envelope` for subdelegation.

### 2.5 Capabilities

**WAS-CAP-01 (MUST):** Support WAUTH-CAP in `format: jwt`.

**WAS-CAP-02 (MUST):** Set short `exp` (deployment policy; RECOMMENDED minutes).

**WAS-CAP-03 (MUST):** Include deterministic `action_hash` binding.

**WAS-CAP-04 (SHOULD):** Sender-constrain capabilities (RECOMMENDED: DPoP via `cnf.jkt`).

### 2.6 Metadata and discovery (WAS-DISCOVERY)

**WAS-META-01 (MUST):** Serve WAUTH-CONFIG at `/.well-known/aaif-wauth-configuration`.

**WAS-META-01A (MAY):** Serve legacy aliases `/.well-known/pwma-configuration` and/or `/.well-known/pwma`. If served, responses MUST be identical after canonical JSON serialization.

**WAS-META-02 (MUST):** WAUTH-CONFIG MUST include `issuer` and `jwks_uri`.

**WAS-META-03 (MUST):** `issuer` in WAUTH-CONFIG MUST match `iss` in issued JWT artifacts.

**WAS-META-04 (MUST):** JWKS at `jwks_uri` MUST contain verification keys for all issued JWT artifacts.

### 2.7 HAPP integration (WAS-HAPP)

**WAS-HAPP-01 (MAY):** Support step-up via HAPP Consent Credentials (HAPP-CC).

If implemented, the WAS MUST:
- bind HAPP approvals to deterministic hashes (intent/action binding)
- validate HAPP approval freshness per policy

---

## 3. MCP Host/Client requirements (MCP-CORE)

**MCP-ELICIT-01 (MUST):** Support QR-mode elicitation display.

**MCP-ELICIT-02 (MUST):** Support URL-mode navigation with explicit user confirmation and clear domain display.

**MCP-ELICIT-03 (SHOULD):** Retry idempotently with stable `requestId` after elicitation completes.

---

## 4. Relying Party requirements

### 4.1 Issuer discovery and signature verification (RP-CORE)

**RP-VER-01 (MUST):** Verify signatures using discovery (`iss` → `/.well-known/aaif-wauth-configuration` → `jwks_uri`).

**RP-VER-02 (MUST):** Enforce `aud`, `iat`, `exp` with bounded skew.

### 4.2 Replay resistance (RP-CORE)

**RP-REPLAY-01 (MUST):** Enforce single-use semantics for capability `jti` until expiry.

### 4.3 Action binding and envelope enforcement (RP-CORE)

**RP-ACT-01 (MUST):** Recompute `action_hash` over the canonical action instance and compare.

**RP-ENV-01 (MUST):** Enforce envelope constraints at execution time.

If the RP cannot enforce envelope constraints, it MUST NOT accept WAUTH capabilities for that operation.

### 4.4 RP requirements signaling (RP-REQSIG)

If an RP claims **RP-REQSIG**, it MUST implement the WAUTH-RP-REQSIG profile (Section 15.1 of the core spec), including:

**RP-REQSIG-01 (MUST):** When rejecting a request due to insufficient authorization, return a `wauth_required` JSON object conforming to `schemas/wauth-required.v0.2.schema.json`.

**RP-REQSIG-02 (MUST):** Include `authorization_details` as defined by RFC 9396 and the WAUTH requirement type schema `schemas/wauth-action-requirements-details.v0.1.schema.json`.

**RP-REQSIG-03 (SHOULD):** Include `wauth_binding` with RP-computed `action_hash` for the denied request.

**RP-REQSIG-04 (MUST):** On retry, recompute the action hash for the retried request and verify it matches the presented capability’s granted authorization details.

### 4.5 Protected Resource Metadata advertisement (RP-PRM)

If an RP claims **RP-PRM**, it MUST implement the WAUTH-RP-PRM profile (Section 15.2 of the core spec), including:

**RP-PRM-01 (MUST):** Publish OAuth Protected Resource Metadata per RFC 9728 at `/.well-known/oauth-protected-resource` (or path variant for multi-resource hosts).

**RP-PRM-02 (MUST):** Include a `wauth` extension object conforming to `schemas/wauth-prm-extension.v0.1.schema.json`.

**RP-PRM-03 (MAY):** Publish a `wauth.requirements_uri` returning a `wauth_requirements` object conforming to `schemas/wauth-requirements.v0.1.schema.json`.

---

### 2.8 Workload identity and attestation (WAS-WORKLOAD-ID)

**WAS-WID-01 (MUST):** Support `schemas/wauth-agent-identity.v0.1.schema.json`.

**WAS-WID-02 (MUST):** Distinguish stable `agent_id` from optional ephemeral `instance_id` and `task_id`.

**WAS-WID-03 (SHOULD):** Support `schemas/wauth-attestation-evidence.v0.1.schema.json` and bind approved PoP keys to attestation evidence.

### 2.9 Lifecycle and revocation (WAS-LIFECYCLE)

**WAS-LIFE-01 (MUST):** Support `schemas/wauth-lifecycle-event.v0.1.schema.json`.

**WAS-LIFE-02 (MUST):** Refuse to mint new capabilities for agents in `suspended`, `revoked`, or `deleted` state.

**WAS-LIFE-03 (SHOULD):** Emit lifecycle events for register, rotate, suspend, revoke, delete, owner_change, and policy_change.

### 2.10 Policy interface (WAS-POLICY)

**WAS-POL-01 (MUST):** Accept policy context objects conforming to `schemas/wauth-policy-context.v0.1.schema.json`.

**WAS-POL-02 (MUST):** Emit policy decisions conforming to `schemas/wauth-policy-decision.v0.1.schema.json`.

**WAS-POL-03 (MUST):** If decision is `wauth_required`, include RFC 9396-compatible `authorization_details`.

### 2.11 Provenance and receipts (WAS-PROVENANCE)

**WAS-PROV-01 (MUST):** Support `schemas/wauth-event.v0.1.schema.json`.

**WAS-PROV-02 (SHOULD):** Chain events using `prev_event_hash` and `event_hash`.

**WAS-PROV-03 (SHOULD):** Emit provenance or receipt events for mandate issuance, capability issuance, step-up completion, and execution outcomes.

### 2.12 Risk signals (WAS-RISK)

**WAS-RISK-01 (MUST):** Support `schemas/wauth-risk-signals.v0.1.schema.json` if the deployment claims risk-aware policy.

**WAS-RISK-02 (SHOULD):** Reevaluate policy when aggregate sensitivity or prompt-injection indicators change materially.

### 3.1 MCP evidence forwarding (MCP-EVIDENCE)

**MCP-EVID-01 (SHOULD):** Support forwarding `agentIdentity`, `attestation`, `riskSignals`, and provenance references to the WAS when requested by policy or RP requirements.

### 4.6 Workload identity verification (RP-WORKLOAD-ID)

If an RP claims **RP-WORKLOAD-ID**, it MUST implement the WAUTH-WORKLOAD-ID profile, including:

**RP-WID-01 (MUST):** Verify any required workload identity or attestation facts before executing the action.

**RP-WID-02 (SHOULD):** Verify the capability PoP key matches the attested or declared `jkt` when such binding is required.

### 4.7 Risk-aware execution (RP-RISK)

If an RP claims **RP-RISK**, it MUST implement the WAUTH-RISK-SIGNALS profile, including:

**RP-RISK-01 (MUST):** Consume required risk-signal fields as policy inputs for high-impact operations.

**RP-RISK-02 (MUST):** Fail closed (`deny` or `wauth_required`) when required risk fields are absent or stale.

## 5. Test vectors

This repository includes test vectors for:

- action hashing and canonicalization
- envelope monotonicity
- RP requirement signaling (`wauth_required` and `wauth_binding`)
- provenance event chaining
- risk-signal to policy-decision examples

Implementations SHOULD use these for regression and interop testing.