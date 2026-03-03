# AAIF Wallet Authorization Protocol (WAuth) v0.5.0 — Wallet Authorization over MCP (Draft)

**Status:** Draft  
**Version:** 0.5.0  
**Track:** AAIF Standards / MCP Profile

## 1. Abstract

This specification standardizes **wallet authorization for agents** using verifiable artifacts, while reusing existing issuance and presentation protocols.

It defines:

1) **A role-based protocol** for issuing **mandates** (reusable, bounded authority) and **capabilities** (short‑lived, per‑action authorization),
2) A deterministic **Intent** and **Envelope** model (hashable, auditable, subdelegation-safe),
3) A verification model for relying parties (discovery, replay protection, action binding), and
4) An **MCP tool profile** (canonical `aaif.wauth.*`, legacy alias `aaif.pwma.*`) that allows agent runtimes to invoke these operations.

### 1.1 About the legacy name “PWMA”

“PWMA” originated as **Personal Wallet Management Agent**: a common deployment pattern where a user relies on a dedicated wallet-management service to govern delegations to other agents.

Starting with **v0.3.0**, the protocol family name is **AAIF Wallet Authorization Protocol (WAuth)**.

- The canonical MCP tool namespace is `aaif.wauth.*`.
- The legacy MCP tool namespace `aaif.pwma.*` is a **backwards-compatible alias**.
- The canonical artifact prefix is `WAUTH-`.
- The legacy artifact prefix `PWMA-` is a **backwards-compatible alias**.

However, for standardization purposes, this document is written in terms of **protocol roles** and **interoperable artifacts**, not in terms of any one deployment topology or wallet implementation.

- A **Personal Wallet Management Agent** deployment is **OPTIONAL**.
- A conforming deployment MUST implement the required **roles** and **artifacts** for the features it claims.
- Wallet storage, key custody, and step‑up mechanisms are expressed as **profiles**.

### 1.2 Composition with existing standards

This protocol is designed to compose with:

- **OpenID for Verifiable Credential Issuance (OpenID4VCI)** for credential acquisition.  
- **OpenID for Verifiable Presentations (OpenID4VP)** for credential presentation (including `direct_post`).  
- **HAPP** (Human Authorization & Presence Protocol) for step‑up approvals when policy requires explicit human presence/authorization.

This protocol also supports commerce integrations (e.g., OpenAI ACP) via a normative **action‑instance canonicalization** profile and test vectors.

### 1.3 Implementation independence

This specification intentionally does **not** mandate a particular wallet implementation.

Examples of conforming implementations include:

- an encrypted cloud-synced container store (wwWallet-style),
- a mobile wallet with local secure hardware,
- an enterprise credential vault,
- a hybrid model with local user approval and cloud authorization.

Implementation examples are described informatively in **Annex A** and **Annex F**.

## 2. Motivation

Agents can already read and reason; next they will routinely execute high-impact actions (payments, submissions, account changes). Existing authorization patterns often prove only that *some caller* is authenticated, not that:

- the caller is a specific accountable agent,
- the action is within an authorized policy envelope,
- the authorization is fresh and replay-resistant,
- a human approved the right thing at the right time.

Most wallet/VC protocols assume direct user operation and interactive confirmation, which does not map cleanly onto delegated agents.

This specification provides a standard way to:

- keep **human root keys** out of agent runtimes,
- mint **bounded, expiring authority** for agents,
- invoke **HAPP** only when policy requires step‑up,
- satisfy OpenID4VC flows without inventing new issuance/presentation protocols,
- make relying-party verification practical via **metadata discovery** and **canonical action binding**.

## 3. Goals and non-goals

### 3.1 Goals

A conforming implementation of this specification MUST:

- Standardize a **Wallet Authorization Service (WAS)** exposed via an **MCP Server profile** (`aaif.wauth.*`).
- Support **mandates** (multi-use, envelope-bounded authority) and **capabilities** (short-lived, per-action authorization).
- Support **subdelegation** (multi-hop delegation) with strict **monotonicity** enforcement.
- Integrate with **HAPP** for step-up approvals when required by policy.
- Provide **verifiable receipts** for important operations.
- Provide **issuer discovery** via a `.well-known` metadata document and JWKS.
- Support **agent identity metadata**, **workload attestation**, **lifecycle events**, **provenance events**, and **risk signal** profiles.

If a deployment claims OpenID4VC bridging features, it MUST:

- Support ingesting and storing credentials obtained via **OpenID4VCI**, and/or
- Support presenting credentials using **OpenID4VP** (including `direct_post`).

### 3.2 Non-goals

This specification does NOT:

- Define biometric/liveness algorithms (delegated to HAPP Presence Providers).
- Replace OAuth/OIDC; it composes with them.
- Standardize all credential formats; it transports credential formats supported by OpenID4VC ecosystems.
- Guarantee that a human understood content; it guarantees explicit approvals when required (via HAPP) and deterministic binding between approvals and actions.
- Fully prevent prompt injection; instead, it standardizes **risk inputs**, **containment hooks**, and **policy outcomes** when prompt-injection risk is present.

## 4. Conventions and terminology

### 4.1 Requirements language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in **BCP 14** (RFC 2119 and RFC 8174).

### 4.2 Roles (normative)

This specification is expressed using the following roles. A deployment MAY implement multiple roles within the same software component.

- **Human Principal (HP):** the natural person (or legal representative) who is the ultimate authority.
- **Agent Host (AH):** the agent runtime (LLM + tools client) that invokes MCP tools.
- **Wallet Authorization Service (WAS):** evaluates policy and issues **Mandates** and **Capabilities**.
- **Credential Store (CS):** stores credentials, mandates, receipts, and audit artifacts. CS MAY be local or remote; it MAY be encrypted end-to-end.
- **Key Custody Service (KCS):** holds **agent operational keys** and enforces signing policy (RECOMMENDED: HSM/TEE or equivalent).
- **Presence Provider (PP):** a HAPP provider that produces portable step-up approval evidence.
- **Workload Identity Provider / Attestation Verifier (WIP/AV):** OPTIONAL role that issues or verifies workload identity and attestation evidence for agent software or infrastructure.
- **Lifecycle Authority (LA):** OPTIONAL role that provisions, suspends, rotates, revokes, and decommissions agent identities.
- **Policy Decision Point (PDP):** OPTIONAL external policy engine that evaluates WAUTH policy context and returns `permit`, `deny`, or `wauth_required`.
- **Issuer:** VC issuer (government, enterprise IdP, bank, etc.).
- **Verifier / Relying Party (RP):** verifies proofs and/or executes actions.

### 4.3 PWMA as a deployment profile (informative)

A **Personal Wallet Management Agent (PWMA)** is an OPTIONAL deployment profile where:

- a user relies on a dedicated WAS (and usually CS + KCS) to manage credentials and issue delegations to task agents,
- the WAS is configured under a “personal” governance model (privacy-first, user-centric policy),
- step-up approvals are typically driven via HAPP.

This document uses “PWMA” as a historical namespace label for artifacts and MCP tools, but the normative requirements are defined in terms of the roles above.

### 4.4 Artifacts

- **WAUTH-INTENT:** deterministic JSON describing a wallet operation requested by an Agent Host.
- **WAUTH-ENVELOPE:** deterministic constraints object used for bounded autonomy.
- **WAUTH-MANDATE:** verifiable artifact encoding ongoing authority within a bounded envelope.
- **WAUTH-CAP:** short-lived, per-action capability token minted under a mandate.
- **WAUTH-REC:** verifiable receipt emitted by a WAS for auditability.
- **WAUTH-AGENT:** portable agent identity metadata object.
- **WAUTH-ATTEST:** workload identity / attestation evidence object.
- **WAUTH-LIFECYCLE-EVT:** lifecycle event describing registration, rotation, suspension, revocation, or deletion.
- **WAUTH-EVT:** tamper-evident provenance/logging event.
- **WAUTH-RISK:** risk-signal object used in policy evaluation and containment decisions.
- **WAUTH-POLICY-BUNDLE:** portable policy package or profile reference.
- **HAPP-CC:** HAPP consent credential (external spec) used for step-up approvals.
- **WAUTH-CONFIG:** metadata document served from a `.well-known` endpoint for discovery.

## 5. Architectural model

### 5.1 Reference architecture (recommended)

```mermaid
flowchart LR
    subgraph UserDomain[User domain]
      HP[Human Principal]
      PP[Presence Provider\n(HAPP profile: EU Wallet / iProov / YubiKey / ...)]
    end

    subgraph AgentDomain[Agent Host domain]
      AH[Agent Host\n(Task Agent runtime)]
      SA[Sub-agent (optional)]
    end

    subgraph AuthDomain[Wallet Authorization domain]
      WAS[Wallet Authorization Service\n(MCP Server: aaif.wauth.*)]
      CS[Credential Store\n(local or remote; may be E2E encrypted)]
      KCS[Key Custody Service\n(HSM/TEE/SE/threshold)]
      WK[.well-known\nWAUTH-CONFIG + JWKS]
    end

    subgraph RPDomain[Relying parties]
      RP1[Merchant / PSP]
      RP2[Bank API]
      RP3[Tax authority]
      Ver[OID4VP Verifier]
    end

    AH -->|MCP tools/call| WAS
    SA -->|A2A or tool call| AH
    WAS --> CS
    WAS --> KCS
    WAS --> WK
    WAS -->|OID4VCI| Iss[VC Issuers]
    WAS -->|OID4VP| Ver
    WAS -->|Capabilities| RP1
    WAS -->|Read-only delegations| RP2
    WAS -->|Submission w/ step-up| RP3

    WAS -->|Step-up request| PP
    HP -->|Approves| PP

    RP1 -.->|verify iss via WAUTH-CONFIG| WK
```

### 5.2 Role composition and deployment flexibility (normative)

- A conforming deployment **MUST NOT** require that the WAS, CS, KCS, and PP are separate components.
- A conforming deployment **MUST** behave as if these roles exist, even if they are co-located.

Examples (informative):

- **User-operated wallet:** the mobile wallet app may implement WAS+CS+KCS locally; the Agent Host only receives proofs/capabilities.
- **Personal PWMA:** WAS+CS+KCS run in a dedicated personal service; PP is the user’s EU Wallet or another HAPP profile.
- **Enterprise governance:** WAS+KCS run in an enterprise boundary; CS may be enterprise vault; PP may be enterprise-auth HAPP profile.

Annex F provides a structured comparison.

### 5.3 Key separation (MUST)

WAS implementations MUST separate:

- **Human root keys**: used only in user-controlled systems (e.g., EU wallet / HAPP PP). WAS MUST NOT require exporting these keys.
- **Agent operational keys**: used to identify/authenticate an acting agent and to bind proof-of-possession (PoP). These keys MUST be distinct from human root keys.
- **Credential Store encryption keys**: used to encrypt CS contents; MUST NOT be transmitted in plaintext to untrusted storage.

### 5.4 Two-tier storage (RECOMMENDED)

Deployments SHOULD implement:

- **Cold Store (CS-COLD):** high-sensitivity credentials and long-lived secrets (encrypted at rest; E2E encryption RECOMMENDED). Access MAY require step-up (HAPP) and/or strong unlock factors.
- **Hot Store (CS-HOT):** operational cache (active mandates, counters, pending receipts, ephemeral presentation state) protected by KCS/TEE policy.

### 5.5 Credential Store security profiles (MUST be profile-based)

A conforming deployment MUST support a profile-based approach for accessing high-sensitivity CS material (CS-COLD). A conforming deployment MUST implement at least one of these profiles:

- **CS-ACCESS-HAPP-RELEASE (RECOMMENDED default)**  
  CS-COLD key material is sealed in KCS and released (unwrapped) only after the WAS verifies a fresh HAPP-CC meeting policy.
- **CS-ACCESS-PRF (OPTIONAL)**  
  CS-COLD key material is wrapped by a secret derived using a PRF-like mechanism (e.g., WebAuthn PRF, EU Wallet derived secret, or equivalent).
- **CS-ACCESS-LOCAL (OPTIONAL)**  
  CS-COLD stored and decrypted locally (on-device deployments).

A deployment MUST publish supported CS access profiles in WAUTH-CONFIG (Section 12).

**Interoperability note (RECOMMENDED):** For continuity with earlier drafts, deployments MAY also advertise legacy identifiers:

- `WAUTH-VAULT-HAPP-RELEASE` (alias of `CS-ACCESS-HAPP-RELEASE`)
- `WAUTH-VAULT-PRF` (alias of `CS-ACCESS-PRF`)
- `WAUTH-VAULT-LOCAL` (alias of `CS-ACCESS-LOCAL`)

Clients/verifiers SHOULD treat these as equivalent.

## 6. Data model overview

WAUTH defines these primary JSON objects (schemas in `/schemas`):

1) **WAUTH-INTENT** — deterministic request for a wallet operation  
2) **WAUTH-ENVELOPE** — deterministic constraints object for bounded autonomy  
3) **WAUTH-MANDATE** — ongoing authority within envelope  
4) **WAUTH-CAP** — per-action capability token  
5) **WAUTH-RESULT** — tool result envelope for MCP responses  
6) **WAUTH-REC** — audit receipt envelope  
7) **WAUTH-CONFIG** — metadata document for discovery  
8) **WAUTH-AGENT** — agent identity metadata  
9) **WAUTH-ATTEST** — workload identity / attestation evidence  
10) **WAUTH-LIFECYCLE-EVT** — lifecycle event record  
11) **WAUTH-EVT** — tamper-evident provenance event  
12) **WAUTH-RISK** — risk signal set  
13) **WAUTH-POLICY-BUNDLE** — portable policy package or reference

WAUTH also defines:

- **Action instances**: deterministic, profile-defined JSON objects hashed into `action_hash` for capabilities.
- **Policy context**: deterministic JSON input used by policy engines.
- **Policy decision**: deterministic JSON output that can be rendered as `permit`, `deny`, or `wauth_required`.

## 7. Canonicalization and hashing

### 7.1 Canonicalization scheme

WAUTH objects that are hashed (WAUTH-INTENT, action instances, envelope views) MUST be canonicalized using **RFC 8785 (JCS)** before hashing.

### 7.2 Restricted JSON types (RECOMMENDED)

To maximize cross-language determinism, implementations SHOULD restrict hashed objects to:

- JSON objects, arrays, strings, booleans, and integers
- no floating point numbers
- timestamps as RFC 3339 strings

### 7.3 Hash format

For any hashed object `X`:

`hash = "sha256:" + base64url( SHA-256( UTF8( JCS(X) ) ) )`

The prefix `sha256:` is REQUIRED.

### 7.4 Action instances and `action_hash`

A **WAUTH action instance** is a profile-defined JSON object representing the *specific action* that a relying party will execute (e.g., “complete checkout session X for amount Y”).

- The RP MUST be able to deterministically reconstruct the same action instance (or an equivalent canonical representation) from its local execution context.
- The RP recomputes `action_hash` over that action instance and compares it to the `action_hash` claim in the capability token.

WAUTH defines one normative action-instance profile in this draft:

- `aaif.wauth.action.acp.checkout_complete/v0.1` (Annex E.2)

Additional action-instance profiles can be registered over time.

## 8. WAUTH-INTENT v0.2

WAUTH-INTENT is a deterministic, machine-readable description of a wallet operation requested by an Agent Host.

### 8.1 Required fields

WAUTH-INTENT MUST contain:

- `version` (string, `"0.2"`)
- `profile` (string)
- `intentId` (uuid)
- `issuedAt` (RFC3339 timestamp)
- `audience` (identifier of the party that will rely on the result; often the WAS)
- `agent` (identifier of requesting agent; includes `id` and MAY include `cnf.jkt`)
- `operation` (typed operation)
- `constraints` (expiry, oneTime, envelope)
- `display` (human-readable fields; for logging/UI)

### 8.2 Profiles

WAUTH-INTENT MUST declare a `profile`. Profiles define:

- required operation parameters,
- envelope semantics for the operation,
- subdelegation semantics.

WAUTH v0.2 defines these baseline profiles:

- `aaif.wauth.mandate.generic/v0.2`
- `aaif.wauth.capability.generic/v0.2`
- `aaif.wauth.oid4vp.bridge/v0.2`
- `aaif.wauth.oid4vci.bridge/v0.2`
- `aaif.wauth.agent.register/v0.2`

Unknown profiles MUST be rejected with `WAUTH-ERR-UNSUPPORTED-PROFILE`.

### 8.3 Envelopes (bounded autonomy)

An intent MAY include `constraints.envelope` (WAUTH-ENVELOPE v0.2).

If an envelope is present:

- The WAS MUST include envelope constraints in any step-up approval request (HAPP AI-INTENT conversion).
- The WAS MUST encode the envelope (or an equivalent canonical representation) in the resulting mandate.
- RPs MUST enforce the envelope at execution time if they accept WAUTH capabilities for the action.

## 9. Envelopes: WAUTH-ENVELOPE v0.2

A WAUTH-ENVELOPE is a deterministic constraints object used to express bounded autonomy in a portable, verifiable way.

### 9.1 Envelope structure (baseline)

WAUTH-ENVELOPE v0.2 is a JSON object:

- `version: "0.2"`
- `constraints: { ... }`
- optional `extensions: [...]`

WAUTH defines a baseline set of constraint keys whose semantics and **monotonicity rules are testable**:

- `amount_minor` — per-action amount bounds in minor units (e.g., cents)
- `max_total_amount_minor` — lifetime/counter total bounds in minor units
- `merchant_id` — allow-list of merchants
- `category` — allow-list of categories (deployment-defined vocabulary)
- `mcc` — allow-list of merchant category codes (MCC)
- `shipping_country` — allow-list of destination countries (ISO 3166-1 alpha-2)
- `audience` — allow-list of audiences (RPs)
- `payment_provider` — allow-list of payment processors/providers
- `max_uses` — maximum number of capability consumptions allowed under this mandate

Implementations MAY define additional constraint keys, but they MUST be expressed via `extensions` unless standardized.

### 9.2 Envelope evaluation (profile-defined)

Envelope constraints are applied to **an action instance**.

Each WAUTH-INTENT profile MUST specify how envelope keys map to fields in its action instance.

Example (informative): for ACP checkout completion, `amount_minor` applies to `$.acp.total_amount_minor` (Annex E.2).

### 9.3 Envelope monotonicity algorithm (MUST)

When the WAS issues a **child mandate** or **capability** under a parent mandate, it MUST enforce:

> **child.envelope ⊆ parent.envelope** (the child is equal or more restrictive)

This section defines a fully testable baseline algorithm for v0.2 envelopes.

#### 9.3.1 Definitions

Let:

- `P` be the parent envelope
- `C` be the child envelope

If an envelope is absent, treat it as:

- `version: "0.2"`
- `constraints: {}`

#### 9.3.2 Core rule (REQUIRED)

For every baseline constraint key present in `P.constraints`, the same key MUST be present in `C.constraints`, and `C` MUST be **equal or stricter** than `P` under the key’s comparison rule.

Child envelopes MAY introduce new constraint keys not present in the parent (additional restrictions).

#### 9.3.3 Comparison rules (baseline keys)

**A) `amount_minor` and `max_total_amount_minor`**

Object shape:

- `currency` (required, lowercase ISO 4217)
- `min` (optional integer ≥ 0)
- `max` (optional integer ≥ 0)

Monotonicity:

- `C.currency` MUST equal `P.currency` if `P.currency` is present
- if `P.max` exists then `C.max` MUST exist and `C.max ≤ P.max`
- if `P.min` exists then `C.min` MUST exist and `C.min ≥ P.min`
- if `P.max` does not exist, `C.max` MAY exist (adding a max is more restrictive)
- if `P.min` does not exist, `C.min` MAY exist (adding a min is more restrictive)

**B) `merchant_id`, `category`, `mcc`, `shipping_country`, `audience`, `payment_provider`**

Object shape:

- `in` (required array of unique strings)

Monotonicity:

- `set(C.in) ⊆ set(P.in)`

**C) `max_uses`**

Object shape:

- `le` (required integer ≥ 1)

Monotonicity:

- `C.le ≤ P.le`

#### 9.3.4 Extensions (MUST be safe)

Extensions are objects:

- `type` (string identifier)
- `data` (object)

For any extension `type` present in `P.extensions`, the child MUST include an extension of the same `type`.

Because extension semantics are not generally known, **extension monotonicity is defined as strict equality**:

- `C.extensions[type].data` MUST be deeply equal to `P.extensions[type].data`

This conservative rule guarantees that a child cannot relax an unknown restriction.

## 10. Mandates: WAUTH-MANDATE v0.2

A WAUTH-MANDATE is a verifiable artifact representing delegated authority within a bounded envelope.

### 10.1 Purpose

Mandates allow:

- **bounded autonomy** (repeated low-risk actions without repeated step-up),
- **policy enforcement** (scope + envelope + expiry),
- **subdelegation** (mint narrower child mandates/capabilities).

### 10.2 Required claims (logical)

A mandate MUST contain (logically) the following claims:

- `iss` — mandate issuer (WAS issuer identifier)
- `sub` — agent subject (agent identifier)
- `aud` — allowed audience(s) (RP identifiers or classes)
- `jti` — unique identifier
- `iat`, `exp` — issuance and expiry times
- `scope` — one or more action scopes
- `envelope` — WAUTH-ENVELOPE v0.2
- `delegation` — (optional) parent linkage, chain metadata
- `cnf` — proof-of-possession binding to agent key (REQUIRED unless the token is otherwise sender-constrained)

### 10.3 Format requirements

For interoperability, WAUTH-MANDATE MUST support `format: "jwt"` in the WAUTH result envelope.

Deployments MAY support additional formats (`vc+json`, `vc+sd-jwt`, `cwt`) as capabilities.

### 10.4 Subdelegation rules (MUST)

```mermaid
flowchart LR
  HP[Human Principal] -->|delegates (direct or via WAS)| WAS[WAS]
  WAS -->|issues mandate| AH[Agent Host]
  AH -->|subdelegates\n(narrower scope)| SA[Sub-agent]

  note1[[Monotonicity rules:\nchild ⊆ parent (scope/aud/exp/envelope)]]
  WAS --- note1
```

If the WAS issues a child mandate under a parent mandate, it MUST enforce:

- **Scope monotonicity:** `child.scope` MUST be a subset of `parent.scope`.
- **Audience monotonicity:** `child.aud` MUST be equal to or narrower than `parent.aud`.
- **Time monotonicity:** `child.exp` MUST be ≤ `parent.exp`.
- **Envelope monotonicity:** `child.envelope` MUST be a subset of `parent.envelope` per Section 9.3.

If any monotonicity condition fails, the WAS MUST reject issuance.

## 11. Capabilities: WAUTH-CAP v0.2

A WAUTH-CAP is a short-lived authorization artifact minted under a mandate for a specific action instance.

### 11.1 Purpose

Capabilities provide:

- strong replay resistance (`jti` single-use + very short TTL),
- binding to a specific action instance (`action_hash`),
- sender constraint / proof of possession binding to agent keys.

### 11.2 Required claims (logical)

A capability MUST contain:

- `iss` — capability issuer (WAS)
- `sub` — agent identifier
- `aud` — specific RP identifier
- `jti` — unique (MUST be single-use unless policy explicitly allows reuse)
- `iat`, `exp` — short validity (RECOMMENDED minutes)
- `mandate_jti` — reference to the parent mandate identifier
- `action_hash` — hash of the canonical action instance
- `cnf` — PoP binding to agent key (see Section 11.3)

### 11.3 Sender constraint (RECOMMENDED: DPoP)

Deployments SHOULD sender-constrain capabilities using **DPoP** and the `cnf.jkt` confirmation method.

If a WAUTH-CAP is presented as a bearer token without sender constraint, the RP MUST treat it as high-risk and SHOULD require step-up or additional proof.

### 11.4 Capability enforcement (RP requirements)

An RP that accepts WAUTH capabilities MUST:

1) Verify the token signature and the issuer trust (Section 14).  
2) Enforce `aud` matching (token audience includes the RP).  
3) Enforce `iat/exp` and bounded clock skew.  
4) Enforce sender constraint (`cnf`) when present.  
5) Recompute the `action_hash` over the action instance and compare.  
6) Enforce envelope constraints (profile-defined mapping).  
7) Enforce single-use semantics for `jti` (replay cache).

## 12. Metadata and discovery: WAUTH-CONFIG v0.4

To enable relying parties and clients to verify WAS-issued artifacts, each deployment MUST publish a discovery document and signing keys.

### 12.1 Well-known endpoints (MUST + backwards-compatible aliases)

A conforming deployment with issuer identifier `https://was.example` MUST serve the canonical endpoint:

- `GET https://was.example/.well-known/aaif-wauth-configuration`

Deployments MAY also serve the following legacy alias endpoints:

- `GET https://was.example/.well-known/pwma-configuration`
- `GET https://was.example/.well-known/pwma`

If any alias endpoint is served, its JSON response MUST be identical (after canonical JSON serialization) to the canonical response.

The response body MUST be a **WAUTH-CONFIG** JSON object (schema: `schemas/wauth-metadata.v0.4.schema.json`) and MUST include:

- `issuer` (string, URI) — the issuer identifier used in `iss` claims
- `jwks_uri` (string, URI) — location of a JSON Web Key Set used to verify WAS-signed JWTs
- `wauth_versions_supported` (array of strings)
- `intent_versions_supported` (array of strings)
- `profiles_supported` (array of strings)
- `vault_profiles_supported` (array of strings) — **legacy field name**; enumerates CS access profiles (Section 5.5)
- `formats_supported` (array of strings)
- `mcp.tool_namespaces_supported` (array of strings) — MUST contain at least one of `aaif.wauth` or `aaif.pwma`
- `mcp.tools_supported` (array of strings) — fully-qualified tool names supported by this WAS (e.g., `aaif.wauth.request`)

**Backwards compatibility:** Deployments MAY also include legacy fields `pwma_versions_supported` and/or `mcp.tool_namespace`. If included:

- `pwma_versions_supported` MUST be identical to `wauth_versions_supported`.
- `mcp.tool_namespace` MUST be one of the entries in `mcp.tool_namespaces_supported`.

### 12.2 Declaring role composition (RECOMMENDED)

The WAUTH-CONFIG response SHOULD include a `features` object describing which roles and profiles are co-located:

- `features.roles_supported` (array) — subset of `["WAS","CS","KCS","PP"]`
- `features.cs_profiles_supported` (array) — credential store profiles
- `features.kcs_profiles_supported` (array) — key custody profiles
- `features.pp_profiles_supported` (array) — presence provider profiles (HAPP)
- `features.openid4vc_supported` (object) — `{ "oid4vci": boolean, "oid4vp": boolean, "direct_post": boolean }`

### 12.3 Signing keys (JWKS)

The `jwks_uri` MUST resolve to a JSON Web Key Set (RFC 7517) containing public keys used to verify:

- WAUTH-CAP tokens,
- WAUTH-MANDATE credentials (if JWT-encoded),
- WAUTH-REC receipts (if JWT-encoded),
- any other WAS-signed JWT artifacts.

Keys SHOULD be rotated. Overlapping validity is RECOMMENDED to avoid breaking verification.
## 13. Protocol flows

### 13.1 Agent registration (recommended)

1) Agent Host calls MCP `aaif.wauth.request` with profile `aaif.wauth.agent.register/v0.2`.
2) The WAS either:
   - registers the agent operational key (KCS-backed), or
   - elicits step-up if registration policy requires it.
3) The WAS returns an agent registration receipt.

### 13.2 Mandate issuance (HAPP-gated when required)

1) Agent Host submits a mandate intent.
2) The WAS evaluates policy:
   - if low-risk and already covered, it may mint a mandate immediately.
   - else it returns an elicitation requiring step-up (HAPP).
3) Once step-up evidence is verified, the WAS mints a WAUTH-MANDATE.

**Informative note:** In user-operated wallet deployments, the wallet application may itself act as the WAS and issue mandates locally; the MCP-facing tool surface may be provided by the wallet app or a trusted bridge.

### 13.3 OpenID4VCI bridge (credential issuance)

1) Agent Host submits an OpenID4VCI offer or initiation URL to the WAS.
2) The WAS orchestrates issuance, possibly eliciting user login.
3) Resulting credentials are stored in CS-COLD (or CS-HOT if policy permits).

### 13.4 OpenID4VP bridge (credential presentation)

1) Agent Host submits an OpenID4VP request (URL or object).
2) The WAS selects minimal credentials, applies policy, possibly requires step-up.
3) The WAS returns either:
   - a VP response (return mode) as an artifact, or
   - a receipt indicating `direct_post` completed.

### 13.5 HAPP step-up orchestration (external dependency)

If step-up is required, the WAS:

1) converts WAUTH-INTENT + envelope into a HAPP AI-INTENT payload, including `intent_hash`.
2) requests a HAPP-CC from a Presence Provider profile.
3) verifies the returned HAPP-CC and binds it to mandate/capability issuance.

### 13.6 Capability minting (autonomy within bounds)

1) Agent Host submits a capability intent including an action instance reference or payload (profile-defined).
2) The WAS checks:
   - action is in scope,
   - action satisfies envelope constraints,
   - counters / max_uses / totals,
   - freshness and replay safety.
3) The WAS returns a WAUTH-CAP token (sender-constrained if supported).

## 14. Verification requirements (Relying Parties)

### 14.1 Issuer discovery (MUST)

An RP that verifies WAS-signed JWT artifacts MUST:

1) read `iss` from the token,
2) fetch and validate the issuer discovery document (canonical `/.well-known/aaif-wauth-configuration`; legacy `/.well-known/pwma-configuration`),
3) fetch `jwks_uri`,
4) verify signatures against that JWKS.

### 14.2 Audience and time checks (MUST)

RPs MUST enforce `aud`, `iat`, `exp` with bounded skew.

### 14.3 Action binding checks (MUST for capabilities)

RPs MUST reconstruct the action instance and verify `action_hash`.

For ACP commerce, use Annex E.2 mapping.

### 14.4 Envelope enforcement (MUST)

RPs MUST enforce envelope constraints at execution time.

If an RP cannot enforce envelope constraints, it MUST NOT accept WAUTH capabilities for that operation.

## 15. Profiles

This specification defines **optional profiles** that package interoperable behaviors for specific deployment contexts, without changing the core artifact model.

A deployment MAY claim conformance to one or more profiles. Profile identifiers are strings of the form:

- `aaif.wauth.profile.<name>/v<major>.<minor>`

This document defines the following profiles:

- **WAUTH-RP-REQSIG** — RP requirement signaling and safe per-request binding (normative)
- **WAUTH-RP-PRM** — Advertising WAUTH support and requirement templates using OAuth Protected Resource Metadata (normative)
- **WAUTH-POLICY-MGMT** — Policy authoring, distribution, and DSL guidance (mixed: normative schemas, informative DSL choices)
- **WAUTH-WORKLOAD-ID** — Agent identity metadata and workload attestation (normative)
- **WAUTH-LIFECYCLE-SCIM** — Lifecycle management and SCIM mapping (normative)
- **WAUTH-PROVENANCE** — Tamper-evident logging, transparency, and non-repudiation (normative)
- **WAUTH-RISK-SIGNALS** — Prompt-safety and risk signal interchange (normative)
- **WAUTH-AAUTH-ACQ** — AAuth acquisition compatibility (informative)

### 15.1 WAUTH-RP-REQSIG — RP requirement signaling (normative)

**Problem:** Relying parties MUST NOT trust an agent to voluntarily invoke step‑up or to self-limit authority. Therefore the RP needs a standard way to say:  
“**I will not execute this request unless you present a capability meeting these requirements**.”

This profile defines an RP-side signaling mechanism:

- RP returns a standardized error payload **`wauth_required`**.
- The payload carries **RFC 9396** `authorization_details` objects describing the *minimum acceptable authorization*.  
- The RP includes an optional **`wauth_binding`** object that binds the requirements to the *concrete denied request* using an RP-computed `action_hash`.

**Profile identifier:**
- `aaif.wauth.profile.rp-requirements-signaling/v0.1`

#### 15.1.1 `wauth_required` response (MUST)

An RP conforming to this profile MUST implement the `wauth_required` response body (JSON) defined by schema:

- `schemas/wauth-required.v0.2.schema.json`

The response MUST contain:

- `error: "wauth_required"`
- `authorization_details: [...]` — an array of requirement objects

Each requirement object MUST conform to:

- `schemas/wauth-action-requirements-details.v0.1.schema.json`

#### 15.1.2 Requirements model (MUST reuse RFC 9396)

`authorization_details` MUST follow the model of RFC 9396:

- It MUST be an array of JSON objects.
- Each entry MUST contain `type`.
- The semantics of entries are determined by the `type`.

This profile defines a WAUTH requirement `type` (using the schema identifier as the `type` value) and uses it in both:

- **requirements** (RP → agent), and
- **grants** (capability token claim, WAS → agent → RP).

This symmetry is intentional: it allows RPs and gateways to implement one validator for both “required” and “granted” authorization details.

#### 15.1.3 Safe per-request binding (RECOMMENDED; MUST if `wauth_binding` is present)

To prevent “capability swapping” (obtaining authorization for request A and replaying it on request B), the RP SHOULD include `wauth_binding` (schema):

- `schemas/wauth-binding.v0.1.schema.json`

If present, `wauth_binding` MUST include:

- `method: "rp_action_hash"`
- `action_profile`
- `hash_alg: "S256"`
- `action_hash` — base64url(SHA‑256(JCS(action_instance)))

The RP MUST compute `action_hash` from the *denied request* using the action profile’s canonicalization rules (Section 7) and MUST validate on retry that the presented capability is bound to the retried request’s computed `action_hash`.

#### 15.1.4 Capability satisfaction (MUST)

When a client retries with a presented capability (e.g., WAUTH-CAP), the RP MUST treat the request as authorized only if:

1) The capability is valid per Section 14 (issuer discovery, signature, `aud`, `iat/exp`, replay).  
2) The capability contains at least one granted `authorization_details` entry that **satisfies** at least one required entry from the RP’s last `wauth_required`.  
3) If `wauth_binding` was issued, the capability’s `action_hash` MUST equal the RP-computed `action_hash` for the retried request.  
4) Envelope constraints are enforced at execution time (Section 14.4).

#### 15.1.5 Step-up triggering (HAPP)

This profile does not require the RP to call HAPP directly. Instead:

- The RP requires proofs that *imply* step-up occurred (e.g., assurance constraints in `authorization_details`).
- If requirements include `assurance.min_pohp`, acceptable PP profiles, or freshness, the WAS MUST obtain (or reference) HAPP evidence before minting a satisfying capability.

An RP MAY include a `happ_challenge` object in the `wauth_required` response to bind the step‑up approval to the denied transaction.

### 15.2 WAUTH-RP-PRM — Protected Resource Metadata advertisement (normative)

**Problem:** RPs need a way to advertise “locks” up front, so agents, gateways, and enterprise platforms can integrate without bespoke documentation.

This profile defines a WAUTH extension to **OAuth 2.0 Protected Resource Metadata (RFC 9728)**:

- the RP publishes metadata at `/.well-known/oauth-protected-resource` (or the path-variant for multi-resource hosts),
- the metadata indicates that WAUTH is supported and which requirement signaling and capability formats are accepted,
- the metadata can advertise pointers to requirement templates to enable preflight capability acquisition.

**Profile identifier:**
- `aaif.wauth.profile.rp-protected-resource-metadata/v0.1`

#### 15.2.1 Baseline RFC 9728 requirements (MUST)

An RP conforming to this profile MUST publish a valid RFC 9728 Protected Resource Metadata document.

At minimum, the document MUST contain:

- `resource` — the protected resource identifier
- `authorization_servers` — if the RP uses OAuth/OIDC authorization servers (RECOMMENDED for enterprise deployments)

The RP MUST follow RFC 9728 validation rules, including the requirement that the returned `resource` value matches the resource identifier used to form the metadata URL.

#### 15.2.2 WAUTH extension object (MUST)

The RFC 9728 metadata JSON object MUST include a `wauth` member (an extension object) that validates against:

- `schemas/wauth-prm-extension.v0.1.schema.json`

The `wauth` object MUST include:

- `supported: true`
- `profiles_supported` — MUST include `aaif.wauth.profile.rp-requirements-signaling/v0.1` if the RP emits `wauth_required`
- `authorization_details_types_supported` — MUST include the WAUTH requirement/grant type URI used by the RP
- `capability_formats_supported` — e.g., `["jwt+rfc9068"]`

#### 15.2.3 Requirement template discovery (OPTIONAL)

To enable preflight acquisition, an RP MAY publish requirement templates using either:

- `wauth.requirements_uri` (URL) returning a `wauth_requirements` document (schema: `schemas/wauth-requirements.v0.1.schema.json`), or
- `resource_policy_uri` / `resource_documentation` (RFC 9728) linking to human-readable policy.

If `wauth.requirements_uri` is present, the returned object MUST use RFC 9396 `authorization_details` and MUST NOT include per-request binding fields such as `action_hash`.

### 15.3 WAUTH-POLICY-MGMT — Policy management and DSL guidance (mixed)

Large-scale adoption requires a consistent way to author, review, version, distribute, and execute policy across:

- API gateways,
- microservices,
- MCP servers and tool providers,
- relying parties that execute high-impact actions.

This profile intentionally does not mandate one policy engine. Instead it standardizes **policy inputs and outputs** and provides suggested DSL profiles.

**Profile identifier:**
- `aaif.wauth.profile.policy-management/v0.1`

#### 15.3.1 Normative policy interface

A WAS or RP claiming this profile MUST support:

- **Policy Context schema** (input): `schemas/wauth-policy-context.v0.1.schema.json`
- **Policy Decision schema** (output): `schemas/wauth-policy-decision.v0.1.schema.json`

Policy context SHOULD include, when available:

- request metadata (`method`, `path`, `resource`, `transaction_id`)
- action metadata (`action_profile`, `action_instance`, `action_hash`)
- agent identity (`agent_id`, `instance_id`, `owner`, `org_boundary`)
- attestation and custody facts (`attested`, `attestation_type`, `kcs_profile`, `jkt`)
- existing authorization facts (`mandate`, `capability`, `authorization_details`)
- provenance facts (`input_sources`, `prompt_hash`, `source_trust`)
- risk facts (`prompt_injection_indicators`, `aggregated_sensitivity`, `recommended_action`)

A policy decision MUST result in exactly one of:

- `permit`
- `deny`
- `wauth_required`

If the result is `wauth_required`, the decision MUST include an `authorization_details` array that can be returned directly by an RP or consumed by a WAS for capability minting.

#### 15.3.2 Dynamic policy updates

A conforming implementation SHOULD support dynamic updates when context changes, including:

- new tools or resources become available to the agent,
- new data sources raise aggregate sensitivity,
- lifecycle events suspend or rotate keys,
- new risk indicators appear in a conversation or tool chain.

When policy changes invalidate existing authority, the WAS MUST stop minting new capabilities under the affected mandate and SHOULD emit a lifecycle or provenance event explaining the reason.

#### 15.3.3 DSL choices (informative)

Suggested DSL/profile options:

- CEL (Common Expression Language) for embeddable expressions
- OPA/Rego for centralized policy-as-code
- Cedar for principal/resource authorization
- NGAC-aligned graph policies for large-scale delegation and event-driven updates

The primary interoperability mechanism is the **requirements model** itself: by expressing policy outcomes as RFC 9396 `authorization_details`, enterprises can deploy consistent “locks” without rewriting application business logic.

### 15.4 WAUTH-WORKLOAD-ID — Agent identity metadata and workload attestation (normative)

**Problem:** Enterprises need portable agent identity metadata, including what is stable, what is ephemeral, and how to bind execution to software, hardware, or organizational boundaries.

**Profile identifier:**
- `aaif.wauth.profile.workload-identity/v0.1`

#### 15.4.1 WAUTH-AGENT object

Implementations claiming this profile MUST support `schemas/wauth-agent-identity.v0.1.schema.json`. A WAUTH-AGENT object SHOULD distinguish:

- `agent_id` — stable logical identity of the agent service or application
- `instance_id` — runtime or deployment instance, which MAY be ephemeral
- `task_id` — task-scoped identity, which MAY be ephemeral
- `owner` — user, enterprise, or legal entity accountable for the agent
- `org_boundary` — organizational or tenant boundary
- `software_identity` — version, image digest, signing identity, or equivalent
- `workload_identity` — external workload identity such as a SPIFFE ID, DID, client_id, or X.509 subject

RPs MAY require any subset of these fields in policy. WAS implementations MUST preserve stable and ephemeral identity dimensions separately so task-scoped authority does not overwrite long-lived accountability fields.

#### 15.4.2 WAUTH-ATTEST object

Implementations claiming this profile MUST support `schemas/wauth-attestation-evidence.v0.1.schema.json`. WAUTH-ATTEST carries workload identity or attestation evidence sufficient to bind a key to an agent execution environment.

Supported evidence types MAY include:

- SPIFFE/SPIRE issued workload identities
- X.509 workload certificates or mTLS identities
- TPM or enclave attestation reports
- enterprise-issued software signing attestations
- custom workload identity evidence

A capability or mandate bound to an attested agent SHOULD bind the attested key thumbprint into `cnf.jkt` (or equivalent PoP field).

#### 15.4.3 Strong authentication for agents

For purposes of this profile, “strong authentication” means:

1) the agent presents a key it controls,
2) that key is bound to a WAUTH-AGENT identity, and
3) the binding is corroborated by valid attestation evidence or an enterprise-approved workload identity source.

If an RP requires workload attestation freshness, the RP MUST express that requirement in policy or requirements templates, and the WAS MUST NOT mint a satisfying capability without fresh enough evidence.

#### 15.4.4 SPIFFE / workload-identity compatibility

If `workload_identity.type` is `spiffe`, the `workload_identity.value` SHOULD be the SPIFFE ID, and the corresponding SVID or attestation evidence SHOULD appear in WAUTH-ATTEST. This specification does not require SPIFFE, but it defines a clean mapping for environments that use it.

### 15.5 WAUTH-LIFECYCLE-SCIM — Lifecycle and revocation propagation (normative)

**Problem:** Agent identities and keys must be provisioned, updated, suspended, rotated, and revoked across systems.

**Profile identifier:**
- `aaif.wauth.profile.lifecycle-scim/v0.1`

#### 15.5.1 WAUTH-LIFECYCLE-EVT object

Implementations claiming this profile MUST support `schemas/wauth-lifecycle-event.v0.1.schema.json`. Supported event types include at least:

- `register`
- `activate`
- `rotate`
- `suspend`
- `resume`
- `revoke`
- `delete`
- `owner_change`
- `policy_change`

A WAS MUST stop minting new capabilities for an agent that is suspended, revoked, or deleted.

A WAS SHOULD emit lifecycle events whenever:

- agent operational keys rotate,
- ownership or organizational boundaries change,
- mandates are invalidated by lifecycle state, or
- policy changes require step-up or re-approval.

#### 15.5.2 SCIM mapping

Implementations MAY use SCIM as the provisioning and lifecycle control plane. For interoperability, this profile defines `schemas/wauth-scim-agent-extension.v0.1.schema.json`, a SCIM extension that carries:

- `agentId`
- `instanceId`
- `state`
- `ownerRef`
- `workloadProfile`
- `kcsProfile`
- `activeJkts`

When SCIM is used, a conforming implementation SHOULD map SCIM create/update/deactivate/delete operations to WAUTH-LIFECYCLE-EVT records.

#### 15.5.3 Key rotation and revocation

When a key is rotated:

- the new `jkt` MUST be published through lifecycle state before or at first use,
- the old `jkt` MUST be marked deprecated or revoked,
- existing active mandates SHOULD be reevaluated according to local policy.

When a key or agent is revoked, RPs SHOULD reject new capabilities referencing revoked keys once revocation state is visible to them through discovery, introspection, or policy distribution.

### 15.6 WAUTH-PROVENANCE — Tamper-evident logging, transparency, and non-repudiation (normative)

**Problem:** Enterprises need verifiable logs that link agent actions back to agent identity, delegated authority, human approvals, and the data/prompt sources used to reach an action.

**Profile identifier:**
- `aaif.wauth.profile.provenance/v0.1`

#### 15.6.1 WAUTH-EVT object

Implementations claiming this profile MUST support `schemas/wauth-event.v0.1.schema.json`. A WAUTH-EVT record is a tamper-evident event envelope with at least:

- `event_id`
- `event_type`
- `created_at`
- `agent_id`
- optional `instance_id`, `task_id`, `action_profile`, `action_hash`
- references to `mandate`, `capability`, `human_auth`, and `risk` artifacts when applicable
- `prev_event_hash` for chained event logs
- `event_hash` over the canonicalized event body

#### 15.6.2 Minimum events

A conforming WAS SHOULD emit WAUTH-EVT records for:

- issuance or refresh of mandates
- capability minting
- HAPP step-up completion
- lifecycle events that change execution authority
- RP execution receipts when returned to the WAS
- provenance registration for prompt/data sources

#### 15.6.3 Non-repudiation binding

A provenance chain SHOULD link:

- the agent identity that requested the action,
- the mandate/capability that authorized it,
- the human approval artifact (if any), and
- the final RP receipt or execution outcome.

A WAUTH-REC MAY summarize one or more WAUTH-EVT entries, but MUST preserve references sufficient to reconstruct the event chain.

### 15.7 WAUTH-RISK-SIGNALS — Prompt-safety and risk signal interchange (normative)

**Problem:** WAUTH cannot prevent prompt injection by itself, but it can standardize how risk signals and aggregate sensitivity are carried into policy and how systems fail safely when risk rises.

**Profile identifier:**
- `aaif.wauth.profile.risk-signals/v0.1`

#### 15.7.1 WAUTH-RISK object

Implementations claiming this profile MUST support `schemas/wauth-risk-signals.v0.1.schema.json`. A WAUTH-RISK object MAY include:

- prompt origin trust (`trusted`, `untrusted`, `mixed`)
- source inventory and source trust scores
- tool trust levels
- detected or suspected prompt-injection indicators
- aggregate sensitivity labels derived from multiple sources
- recommended action (`permit`, `step_up`, `deny`)

#### 15.7.2 Policy use

WAS and RP implementations MAY use WAUTH-RISK directly in policy decisions. If an RP or WAS claims this profile for a high-impact endpoint, then:

- missing required risk fields MUST result in `deny` or `wauth_required`, not silent `permit`;
- aggregate sensitivity increases SHOULD be treated as context changes for policy reevaluation;
- untrusted-source or suspected-injection signals SHOULD be able to trigger step-up or deny outcomes.

#### 15.7.3 Scope of this profile

This profile does not standardize detection algorithms for prompt injection. It standardizes:

- the risk information carried between components,
- the policy hooks that consume it, and
- the containment posture after risk is detected or suspected.

### 15.8 WAUTH-AAUTH-ACQ — AAuth acquisition compatibility (informative)

AAuth may be used as an upstream, browserless grant-acquisition profile in conversational channels. This specification remains focused on **execution-boundary authorization**.

Compatibility guidance:

- A WAS MAY use AAuth or similar OAuth extensions to obtain initial user-linked authorization or approval in browserless environments.
- Once that upstream grant exists, WAUTH still governs: RP requirement signaling, step-up triggers, action binding, replay protection, and capability verification.
- Implementations SHOULD avoid treating AAuth scope grants as sufficient for high-impact execution unless they are converted into WAUTH capabilities or equivalent structured authorization.

## 16. Security considerations

- **No bearer-only high-impact capabilities.** Strongly prefer sender constraint (DPoP) for capabilities.
- **Replay resistance.** RPs MUST enforce `jti` single-use for capabilities; the WAS MUST keep issuance logs for dispute resolution.
- **Least privilege.** Mandates SHOULD be scoped, audience-restricted, and short-lived; envelopes SHOULD be narrow.
- **Key compromise.** Agent operational keys MUST be isolated from human keys; use KCS/TEE where possible.
- **Phishing resistance.** Any step-up UI MUST be on the provider domain (URL-mode or QR-mode).
- **Extension safety.** Unknown envelope extensions are equality-locked in subdelegation to avoid relaxation.
- **Attestation drift.** If workload identity or attestation freshness is required by policy, stale or missing attestation MUST fail closed.
- **Lifecycle invalidation.** Suspended or revoked agents MUST NOT receive new capabilities; key rotation MUST update PoP bindings promptly.
- **Provenance integrity.** Event chains SHOULD be hash-linked and signed or sealed to make tampering detectable.
- **Prompt-safety containment.** Prompt-injection risk signals are inputs to policy, not guarantees of prevention. High-risk endpoints SHOULD deny or require step-up when risk context is incomplete or suspicious.

## 17. Privacy considerations

- Prefer **selective disclosure** credentials and minimal presentation sets.
- Envelopes SHOULD avoid embedding full PII (e.g., shipping address); use hashes when practical.
- Deployments SHOULD store sensitive audit data in encrypted stores with minimal retention.
- Provenance records SHOULD minimize raw prompt storage; prompt hashes and source references are preferred when they provide sufficient audit value.
- Risk-signal sharing SHOULD avoid unnecessary model internals or personal data; carry only what is needed to support a policy decision.

## 18. Conformance

Conformance requirements are defined in `conformance-v0.5.0.md`.

## 19. Compatibility notes (Annex)

This annex is informative (non-normative). It describes how this specification composes with adjacent standards and ecosystems.

### A. Credential Store profiles (wwWallet and others)

This specification does not require any particular wallet implementation. It standardizes **authorization artifacts** and **verification behavior**.

A conforming CS MAY be implemented as:

- an end-to-end encrypted, cloud-synced container store (wwWallet-style),
- a local device wallet,
- an enterprise credential vault,
- a hybrid.

The key requirement is that CS contents are protected according to the deployment’s declared **CS access profile** (Section 5.5) and that the WAS can enforce policy decisions without exposing human root keys.

### B. OpenID4VCI and OpenID4VP

This specification does not replace issuance/presentation protocols. Instead it standardizes:

- how an Agent Host requests issuance/presentation operations from a WAS,
- how those are executed via OpenID4VCI/OpenID4VP in a policy-aware way,
- how autonomy is expressed via mandates and capabilities.

### C. HAPP (step-up approvals)

This specification treats step-up as an external proof layer. When required by policy, the WAS requests HAPP-CC from certified Presence Providers and binds approvals to deterministic intent hashes (via HAPP).

This allows:

- EU-wallet based approvals,
- liveness-based approvals (e.g., iProov),
- hardware-backed approvals (e.g., YubiKey profiles),
- enterprise second factors (via appropriate PP profiles).

### D. ACK-ID (Agent Commerce Kit) compatibility

ACK-ID focuses on verifiable agent identity and ownership chains using DIDs and VCs (e.g., controller credentials). This specification is complementary: it focuses on policy-limited delegated authority, step-up governance, and replay-safe execution.

Compatibility approach:

- Use ACK-ID identity credentials as *agent identity credentials* stored in CS.
- Use mandates/capabilities for *action authorization*, optionally referencing the ACK-ID identity chain for accountability.

### E. OpenAI Agentic Commerce Protocol (ACP) compatibility

ACP defines commerce flows (checkout sessions, delegated payments) between agent experiences and merchants/PSPs.

A WAS can act as:

- a policy governor determining whether a purchase is allowed under a spending envelope,
- a source of verifiable proofs (OpenID4VP) if merchants require additional claims (age, residency, etc.),
- an audit and receipt store for purchase evidence.

#### E.1 Practical mapping (informative)

- A purchase mandate corresponds to a reusable spending envelope (e.g., “≤ $1000 per purchase, ≤ $3000 total, only these merchants”).
- For each checkout, the WAS mints a per-action capability token whose `action_hash` binds to the exact checkout session and final totals.
- The merchant/PSP still uses ACP delegated payment constraints; WAUTH-CAP is *authorization evidence* and *policy enforcement*, not a replacement for payment rails.

#### E.2 Normative action instance mapping: ACP checkout completion profile (v0.1)

WAUTH defines one normative action-instance profile for ACP compatibility:

- Profile: `aaif.wauth.action.acp.checkout_complete/v0.1`
- Schema: `schemas/wauth-action-instance-acp-checkout.v0.1.schema.json`

This section specifies a **field-by-field, deterministic mapping** from ACP objects to the WAUTH action instance used for `action_hash`.

##### E.2.1 Inputs

Let:

- `CS` be the final ACP **Checkout Session** object.
- `AL` be the ACP **Delegated Payment Allowance** object, if delegated payment is used for this checkout.

##### E.2.2 Output: canonical WAUTH action instance

The resulting action instance MUST be:

```json
{
  "version": "0.2",
  "type": "acp.checkout.complete",
  "acp": {
    "checkout_session_id": "...",
    "merchant_id": "... (optional)",
    "payment_provider": "...",
    "currency": "usd",
    "total_amount_minor": 0,
    "line_items": [{"item_id":"...","quantity":1}],
    "fulfillment": {
      "fulfillment_option_id": "... (optional)",
      "address_hash": "sha256:... (optional)",
      "country": "US (optional)",
      "postal_code": "94131 (optional)"
    },
    "delegated_payment_allowance": { "... optional ..." }
  }
}
```

All amounts in this profile MUST be **integer minor units**, and `currency` MUST be lowercase ISO‑4217.

##### E.2.3 Mapping rules (REQUIRED)

**A) Checkout binding**

- `acp.checkout_session_id = CS.id` (REQUIRED)

**B) Payment provider**

- `acp.payment_provider = CS.payment_provider.provider` (REQUIRED)

**C) Currency normalization**

- `acp.currency = lowercase(CS.currency)` (REQUIRED)

**D) Total amount**

- Find `T = the unique element in CS.totals[] where T.type == "total"`.
  - If no such element exists, mapping MUST fail.
  - If multiple such elements exist, mapping MUST fail.
- `acp.total_amount_minor = T.amount` (REQUIRED)

**E) Line items**

For each element `LI` in `CS.line_items[]`:

- `item_id = LI.item.id`
- `quantity = LI.item.quantity`

Construct:

- `acp.line_items = [ { "item_id": item_id, "quantity": quantity }, ... ]`

To ensure order-independence, `acp.line_items` MUST be sorted by:

1) `item_id` ascending (lexicographic), then  
2) `quantity` ascending.

**F) Merchant identifier**

If `AL` is present:

- `acp.merchant_id = AL.merchant_id` (REQUIRED)

Else if `CS.payment_provider.merchant_id` is present:

- `acp.merchant_id = CS.payment_provider.merchant_id` (OPTIONAL)

Else:

- omit `acp.merchant_id`

**G) Fulfillment option**

If `CS.fulfillment_option_id` is present:

- `acp.fulfillment.fulfillment_option_id = CS.fulfillment_option_id`

**H) Fulfillment address hash (privacy-preserving binding)**

If `CS.fulfillment_address` is present, construct an **address subset** object using these fields if present:

- `name`
- `line_one`
- `line_two`
- `city`
- `state`
- `country`
- `postal_code`

Compute:

- `address_hash = sha256:jcs(address_subset)` (using Section 7.3)

Then set:

- `acp.fulfillment.address_hash = address_hash`

For convenience and policy checks, the mapping MAY also copy:

- `acp.fulfillment.country = CS.fulfillment_address.country` (if present)
- `acp.fulfillment.postal_code = CS.fulfillment_address.postal_code` (if present)

**I) Delegated payment allowance (optional but recommended when present)**

If `AL` is present, include:

```json
"delegated_payment_allowance": {
  "reason": AL.reason,
  "max_amount_minor": AL.max_amount,
  "currency": lowercase(AL.currency),
  "checkout_session_id": AL.checkout_session_id,
  "merchant_id": AL.merchant_id,
  "expires_at": AL.expires_at
}
```

If `AL` is present, implementations SHOULD additionally validate:

- `AL.checkout_session_id == CS.id`
- `lowercase(AL.currency) == lowercase(CS.currency)`
- `AL.max_amount >= acp.total_amount_minor`

##### E.2.4 `action_hash` computation (REQUIRED)

Once the action instance is constructed, compute:

- `action_hash = sha256:jcs(action_instance)` (Section 7.3)

That `action_hash` MUST be the value placed in the WAUTH capability token.

##### E.2.5 Interop guidance (informative)

- RPs SHOULD compute the mapping from their own ACP objects, not from agent-provided copies.
- Including the address hash binds authorization to a destination without disclosing the address in the capability token.
- Sorting `line_items` eliminates ordering-related hash mismatches.

### F. Deployment models (informative)

This specification intentionally supports multiple deployment models. The choice impacts availability, custody, and UX.

#### F.1 User-operated wallet (no standing autonomy)

- WAS is implemented inside a user wallet app.
- Delegation is typically **per action** (step-up each time) or by issuing short-lived, narrow mandates.

Pros:
- Strong user control.

Cons:
- Limited autonomy; user is disturbed frequently.

#### F.2 Embedded WAS (wallet app as MCP server)

- The wallet app provides the MCP server directly to the Agent Host.
- CS and KCS are local to the device.

Pros:
- Minimal trust in third parties.

Cons:
- Device availability constraints.

#### F.3 Personal PWMA service (standing autonomy)

- A dedicated WAS (and typically CS+KCS) operates under user-centric governance.
- HAPP step-up establishes mandates; the WAS mints per-action capabilities autonomously inside envelopes.

Pros:
- Best autonomy/UX with bounded risk.

Cons:
- Requires strong KCS controls and transparency/audit.

#### F.4 Enterprise governance

- WAS+KCS run in an enterprise boundary (policy, compliance, audit).
- CS may be enterprise vault.

Pros:
- Strong operational controls.

Cons:
- Not “personal” custody; policy is enterprise-defined.

#### F.5 Remote custody models for KCS

Deployments SHOULD document KCS trust properties and MAY use:

- HSM custody,
- TEE with attestation,
- threshold/split-key custody.

Regardless of custody, capabilities SHOULD be sender-constrained and replay-protected.

### G. SPIFFE / SPIRE compatibility

This specification does not require SPIFFE or SPIRE, but WAUTH-WORKLOAD-ID provides a direct mapping for environments that use workload identities and attestation. SPIFFE IDs fit naturally into `workload_identity`, and SVID or attestation evidence can be carried in WAUTH-ATTEST.

### H. SCIM compatibility

This specification does not require SCIM, but WAUTH-LIFECYCLE-SCIM defines how SCIM create, update, suspend, and delete operations can be reflected as WAUTH lifecycle events and key state changes.

### I. Policy ecosystem compatibility

WAUTH-POLICY-MGMT is intentionally policy-engine neutral. Environments using NGAC, Cedar, CEL, Rego, XACML-like engines, or proprietary PDPs can interoperate by translating their decisions into WAUTH policy outputs and RFC 9396 `authorization_details`.

### J. AAuth compatibility

AAuth and similar browserless OAuth extensions are complementary to WAUTH. They may be used to acquire upstream grants or approvals, but WAUTH remains the execution-boundary layer that lets an RP demand structured, action-bound, replay-resistant authorization.

## 20. References (informative)

- RFC 8785 — JSON Canonicalization Scheme (JCS)
- RFC 8725 — JSON Web Token Best Current Practices
- RFC 9449 — OAuth 2.0 Demonstrating Proof-of-Possession (DPoP)
- RFC 7517 — JSON Web Key (JWK)
- OpenID4VCI — OpenID for Verifiable Credential Issuance 1.0
- OpenID4VP — OpenID for Verifiable Presentations 1.0
- HAPP (AAIF draft)
- RFC 9396 — OAuth 2.0 Rich Authorization Requests (RAR)
- RFC 9728 — OAuth 2.0 Protected Resource Metadata
- RFC 9068 — JWT Profile for OAuth 2.0 Access Tokens
- RFC 7643 / RFC 7644 — SCIM Core Schema and Protocol
- SPIFFE / SPIRE workload identity specifications
- AAuth draft (browserless agent acquisition profile)