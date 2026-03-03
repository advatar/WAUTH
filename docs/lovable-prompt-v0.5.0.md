# Lovable prompt — generate WAUTH landing page (match HAPP site style)

You are building a landing page website for **WAUTH (AAIF Wallet Authorization Protocol)** that matches the **style, layout, and headings** of the existing HAPP landing page.

## Non-negotiable requirements

1) **Match the exact top-level section headings** and order used on the HAPP site:
   - Overview
   - Status
   - Abstract
   - Motivation
   - Scope & Non-Goals
   - Design Principles
   - Model Overview
   - Terminology
   - Core Components
   - MCP Interoperability
   - Quickstart
   - Conformance
   - Security
   - Privacy
   - Registries
   - Roadmap
   - Working Group
   - FAQ
   - References

2) Use a left-side (or sticky) table-of-contents / section navigation exactly like HAPP.

3) Keep the visual system similar (hero, cards, callouts, code blocks, clean typography).

4) The site must be **in sync with WAUTH v0.5.0** and MUST highlight:
   - RP adoption profiles (WAUTH-RP-REQSIG, WAUTH-RP-PRM)
   - Policy management proposal (portable policy inputs/outputs using `wauth_required` + RFC 9396 `authorization_details`)
   - Workload identity + attestation profile
   - Lifecycle + SCIM profile
   - Provenance / transparency profile
   - Risk-signal / prompt-safety profile

## Branding / copy constraints

- Product name: **WAUTH**
- Long name: **AAIF Wallet Authorization Protocol**
- Tagline: **Portable, auditable authorization for agents — without sharing user root keys**
- Status label: **Community Draft v0.5.0**
- Canonical MCP namespace: `aaif.wauth.*` (legacy alias: `aaif.pwma.*`)

## External links (make them clear buttons)

- “Read the Core Spec” → point to the GitHub file `specification/draft/wauth-v0.5.0.md`
- “MCP Profile” → `specification/draft/mcp-profile-v0.5.0.md`
- “Conformance” → `specification/draft/conformance-v0.5.0.md`
- “Schemas” → `/schemas`
- “Join Working Group” → email link or placeholder URL

## Content to place under each heading

### Overview
Explain WAUTH in 4–6 lines:
- Mandates (reusable, bounded authority) + Capabilities (per-action, short-lived)
- Envelopes for least privilege
- Deterministic action hashing (`action_hash`)
- Composes with HAPP for step-up and OpenID4VC for VC ecosystems
- Designed for MCP tool delivery

Add a “Key idea” callout:
- “Endpoints are the locks. Agents are not trusted. WAUTH standardizes the keys and a way for locks to demand stronger authorization.”

### Status
Show:
- Draft v0.5.0
- Profiles: RP-REQSIG v0.1, RP-PRM v0.1
- Backwards-compatible alias: `aaif.pwma.*`

### Abstract
One paragraph describing bounded authority and action binding.

### Motivation
Bullet list:
- Agents will cause incidents if endpoints accept long-lived bearer tokens
- RPs need a standard way to demand step-up and bounded delegation
- Without requirement signaling, agents can’t be safely integrated

### Scope & Non-Goals
In scope:
- Mandate/Capability artifacts
- RP verification model
- RP requirement signaling + metadata discovery profiles
Out of scope:
- Payment rails
- UX / biometric methods (handled by HAPP profiles)
- Forcing one policy DSL

### Design Principles
Include 7 principles:
1) Key separation
2) Bounded autonomy
3) Action binding
4) Replay resistance
5) Monotonic subdelegation
6) Deployment neutrality
7) Locks + keys (RPs can demand stronger auth)

### Model Overview
Include roles and a diagram.

**Mermaid diagram (flowchart):**
```mermaid
flowchart LR
  AH[Agent Host\n(LLM runtime + MCP client)] -->|aaif.wauth.request| WAS[WAS\nPolicy + Mandates + Caps]
  WAS --> CS[Credential Store\n(local / cloud / enterprise)]
  WAS --> KCS[Key Custody Service\n(SE / HSM / TEE / threshold)]
  WAS -->|Step-up via HAPP when policy requires| PP[Presence Provider\n(EU Wallet / iProov / YubiKey)]
  AH -->|Calls APIs| RP[Relying Party\n(enforces requirements)]
  RP -->|Discovery + JWKS| WAS
```

Add a second diagram specifically for **RP requirement signaling**:

```mermaid
sequenceDiagram
  participant A as Agent Host
  participant R as Relying Party (RP)
  participant W as WAS (aaif.wauth.*)
  participant P as Presence Provider (HAPP)

  A->>R: Execute action
  R-->>A: 401/403 + wauth_required (authorization_details + binding)
  A->>W: aaif.wauth.request(wauthRequired + actionInstance)
  alt Step-up required by policy
    W-->>A: elicitation (QR/URL)
    A->>P: User completes step-up
    P-->>W: HAPP Consent Credential (HAPP-CC)
  end
  W-->>A: WAUTH-CAP (jwt) bound to action_hash
  A->>R: Retry action + WAUTH-CAP (+ DPoP)
  R-->>A: 200 OK (cap consumed; action executed)
```

### Terminology
Define Envelope, Mandate, Capability, Action Instance, action_hash, Step-up.

### Core Components
Include cards for:
- WAUTH-INTENT
- WAUTH-ENVELOPE
- WAUTH-MANDATE
- WAUTH-CAP
- WAUTH-CONFIG (.well-known + JWKS)

**Add a highlighted subsection: “RP Adoption Profiles”**
- WAUTH-RP-REQSIG: runtime `wauth_required` using RFC 9396 `authorization_details`
- WAUTH-RP-PRM: advertise WAUTH support via RFC 9728 Protected Resource Metadata

**Add a highlighted subsection: “Policy Management (proposal)”**
Explain:
- Treat `authorization_details` as the intermediate representation for policy
- A policy engine outputs `permit | deny | wauth_required`
- Mention CEL/OPA/Cedar as options
- Position this as the adoption wedge for enterprises/gateways

### MCP Interoperability
Explain:
- Canonical tool namespace `aaif.wauth.*`
- Legacy alias `aaif.pwma.*`
Provide a short JSON example for calling `aaif.wauth.request`.

### Quickstart
5 steps (define envelope → step-up via HAPP (if needed) → issue mandate → mint cap per action → RP verifies + consumes).

### Conformance
Present 2 columns:
- WAS conformance classes (CORE, DISCOVERY, AUTONOMY, OID4VC, HAPP)
- RP conformance classes (CORE, REQSIG, PRM)

### Security
Bullets:
- No long-lived bearer for high-impact actions
- DPoP sender constraint
- Replay cache required
- Canonicalization + action binding

### Privacy
Bullets:
- minimal disclosure
- avoid embedding PII in envelopes

### Registries
List registry concepts:
- action profiles
- intent profiles
- requirement/grant types (`authorization_details.type`)

### Roadmap
Include:
- more action profiles
- gateway policy bundles
- interop test suite
- standardization milestones

### Working Group
Simple CTA section:
- how to participate
- links to GitHub issues/discussions

### FAQ
Include:
- Do I need a PWMA? (No; it’s a deployment profile)
- Is wwWallet required? (No; implementation-neutral)
- How does this relate to HAPP? (HAPP is step-up; WAUTH is authority + enforcement)

### References
List:
- RFC 9396 (RAR)
- RFC 9728 (Protected Resource Metadata)
- RFC 8785 (JCS)
- RFC 9068 (JWT Access Token profile)
- RFC 9449 (DPoP)

## Final instruction

Produce a complete landing page with the headings above, polished copy, diagrams, and developer-friendly code blocks. Ensure the “Policy Management (proposal)” content is prominent (callout + mention in Overview and Core Components).

### Add this specific positioning subsection under Model Overview
Create a subsection titled **"Positioning in the standards stack"** directly under **Model Overview**. Include a Mermaid or equivalent diagram showing:

- OAuth 2.0 = token plumbing / delegated access
- OIDC = identity layer
- EU Wallet / EUDI Wallet = user-held regulated credentials and attestations
- HAPP = human approval / presence
- WAUTH = agent authorization layer
- RP = execution boundary / policy enforcement point

Use this exact positioning message in the copy:
- OAuth 2.0 answers **how access is obtained and used**
- OIDC answers **who authenticated**
- EU Wallet answers **where trusted user credentials and attestations live**
- HAPP answers **how fresh human approval is obtained**
- WAUTH answers **what an agent may do now, for this exact action, at this endpoint**

Also add a compact bullet list explaining that WAUTH composes with OAuth, OIDC, HAPP, and the EU Wallet rather than replacing them.


## Additional v0.5.0 content requirements

Under **Model Overview**, add a third diagram or card set for:
- WAUTH-WORKLOAD-ID (agent_id, instance_id, task_id, attested key)
- WAUTH-LIFECYCLE-SCIM (register, rotate, suspend, revoke)
- WAUTH-PROVENANCE (event chain, receipt, human approval ref)
- WAUTH-RISK-SIGNALS (prompt origin, source trust, aggregate sensitivity, recommended action)

Under **Core Components**, add a clearly highlighted subsection titled **"Enterprise controls added in v0.5.0"** explaining that WAUTH now covers:
- identification metadata for agents
- strong agent authentication via workload identity / attestation
- lifecycle and revocation propagation
- tamper-evident logging and non-repudiation
- prompt-safety risk inputs and containment

Under **Security**, include a compact note that WAUTH does not standardize prompt-injection detection algorithms; it standardizes the risk-signal interchange and fail-safe policy hooks after risk is detected or suspected.

Under **Registries**, add:
- workload identity profile registry
- attestation evidence type registry
- lifecycle event type registry
- risk signal type registry

Under **FAQ**, add:
- How does WAUTH handle agent identity and strong authentication?
- Does WAUTH solve prompt injection?
- How does WAUTH use SCIM / SPIFFE / workload identity?
- Where does AAuth fit?
