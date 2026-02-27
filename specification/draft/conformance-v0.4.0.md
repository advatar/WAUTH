# AAIF Wallet Authorization Protocol (WAuth) — Conformance Requirements v0.4.0 (Draft)

**Status:** Draft  
**Version:** 0.4.0  
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

### 1.2 Relying Party (RP)

- **RP-CORE** — verifies WAUTH-CAP and enforces envelope + action binding + replay controls.
- **RP-REQSIG** — RP-CORE plus WAUTH-RP-REQSIG runtime requirement signaling (`wauth_required`).
- **RP-PRM** — advertises WAUTH support via OAuth Protected Resource Metadata (RFC 9728) with WAUTH extension object.

### 1.3 MCP Host/Client

- **MCP-CORE** — supports URL/QR elicitations and idempotent retries.

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

## 5. Test vectors

This repository includes test vectors for:

- action hashing and canonicalization
- envelope monotonicity
- RP requirement signaling (`wauth_required` and `wauth_binding`)

Implementations SHOULD use these for regression and interop testing.