# WAUTH Profile: Policy Management Guidance (WAUTH-POLICY-MGMT) v0.1

**Status:** Draft (non-final).  
**Intended audience:** enterprises, gateway vendors, RP teams, WAS implementers.

This document is **informative**. It proposes a practical way to drive RP adoption by standardizing the *interfaces* of policy (inputs/outputs), while keeping the *policy language* flexible.

The key observation is:

- WAUTH already has a portable, machine-readable requirements/grants model via **RFC 9396 `authorization_details`**.
- Therefore, the “policy API” can be:  
  **(context) → (decision | wauth_required with authorization_details)**

---

## 1. Goals

- Make it easy for RPs (and gateways) to adopt WAUTH without rewriting business logic.
- Enable “locks” (endpoints) to **demand step-up** and **bounded delegation** consistently.
- Support centralized policy distribution and audit.

---

## 2. Standardizing the policy interface

### 2.1 Policy Context (input)

A policy engine evaluates a **Policy Context** object describing:

- the concrete action instance,
- the caller and its presented credentials/capabilities,
- the resource/rp being called,
- risk signals and environment.

Proposed schema:

- `schemas/wauth-policy-context.v0.1.schema.json`

### 2.2 Policy Decision (output)

A policy engine returns one of:

- `permit` (possibly with obligations),
- `deny`,
- `wauth_required` with an `authorization_details` template and optional assurance constraints.

Proposed schema:

- `schemas/wauth-policy-decision.v0.1.schema.json`

The `wauth_required` form SHOULD align to the WAUTH-RP-REQSIG `wauth_required` payload so gateways can return it directly.

---

## 3. Where policy runs

WAUTH deliberately allows multiple policy deployment patterns:

1) **On the RP** (application-owned policy)
2) **At an API gateway** (enterprise adoption wedge; “OIDC/WAuth gateway”)
3) **In the WAS** (personal or enterprise wallet governor)
4) **Hybrid** (gateway handles baseline; RP handles business exceptions)

---

## 4. DSL options (non-normative)

Enterprises already have preferences. WAUTH should not force a single DSL.

Common choices:

- **CEL** (embedded; good for per-request expressions)
- **OPA/Rego** (centralized policy-as-code)
- **Cedar** (principal/resource authorization with strong semantics)

Interoperability comes from the standardized **input/output schemas** and from expressing requirements as RFC 9396 `authorization_details`.

---

## 5. Policy bundle and lifecycle (informative)

A practical distribution model is:

- a signed **Policy Bundle** (versioned) containing:
  - policies (DSL-specific),
  - schemas and action profiles used,
  - references to requirement templates,
  - optional human-readable change logs.

Bundles can be deployed to gateways, RPs, and WAS components.

---

## 6. Example: “shopping autonomy under $1000” (informative)

Policy intent:

- Permit autonomous purchase completion if:
  - amount <= 1000 USD
  - merchant is allow-listed
  - user previously approved a mandate within last 30 days
- Otherwise respond with `wauth_required` requiring:
  - step-up approval (HAPP) and
  - a one-time capability bound to the concrete checkout action

The key output is still the same: a `wauth_required` + `authorization_details` template.