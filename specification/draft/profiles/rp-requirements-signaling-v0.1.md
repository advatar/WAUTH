# WAUTH Profile: RP Requirements Signaling (WAUTH-RP-REQSIG) v0.1

**Status:** Draft (non-final).  
**Intended audience:** Relying Parties / Resource Servers (RPs/RSs), Agent Hosts, Wallet Authorization Services (WAS), gateway vendors.

This profile specifies how an RP signals that a request is **not yet acceptable** and what **verifiable authorization** is required for the RP to execute the requested action. It is designed for environments where the *agent/client is not trusted* and enforcement occurs at the RP execution boundary.

This profile reuses the OAuth 2.0 Rich Authorization Requests (RAR) structured parameter **`authorization_details`** (RFC 9396) as the common “requirements and grants” data model, so that requirements and granted capabilities can share the same structure and validation logic.

---

## 1. Conventions and normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in **BCP 14** (RFC 2119 and RFC 8174) when, and only when, they appear in all capitals.

---

## 2. Roles

- **RP / Resource Server (RS):** The protected endpoint (“lock”) that executes business actions and enforces authorization at the execution boundary.
- **Client / Agent Host:** The software initiating the call to the RP (e.g., an agent runtime, a gateway, or an app acting on the user’s behalf).
- **WAS (Wallet Authorization Service):** The service that evaluates delegation policy and issues **capabilities** meeting the RP’s requirements.
- **Presence Provider (PP):** A system invoked via HAPP when step-up human approval is required (out of scope here; referenced via assurance requirements).

---

## 3. Profile overview

### 3.1 Goal

Enable an RP to:
1) **Deny** a request that does not meet its requirements, and  
2) Return a standard **`wauth_required`** response describing *exactly what it will accept*, including a per-request binding that prevents capability swapping.

### 3.2 Approach

- The RP expresses minimum acceptable authorization using RFC 9396 **`authorization_details`** objects.
- The RP supplies a **`wauth_binding`** object that includes an RP-computed **`action_hash`** for the concrete request.
- The client obtains a capability from the WAS whose `authorization_details` satisfy the requirements and whose `action_hash` matches the binding.
- The client retries the request with:
  - the capability (typically as a JWT access token), and
  - proof-of-possession (RECOMMENDED: DPoP).

---

## 4. Data model

### 4.1 WAUTH Authorization Details type (RAR type object)

This profile defines a WAUTH RAR type object, referred to as **WAUTH-ACTION**.

The object is carried as an element of the RFC 9396 `authorization_details` array. It uses a collision-resistant `type` value (URI) as recommended for open standards.

**Type identifier (normative):**
```json
{
  "type": "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1"
}
```

**Fields (normative core):**

- `type` (REQUIRED): The WAUTH-ACTION type identifier (string).
- `actions` (REQUIRED): Array of action identifiers understood by the RP (RFC 9396 common field).
- `locations` (REQUIRED): Array of resource identifiers/URIs for intended use (RFC 9396 common field).
- `action_profile` (REQUIRED): Registry key that defines how to construct and canonicalize an `action_instance` for hashing.
- `hash_alg` (REQUIRED): `"S256"` for SHA-256.
- `action_hash`:
  - **OPTIONAL in requirements** (template mode), and
  - **REQUIRED in a granted capability** (bound to a concrete action).

**Envelope constraints (OPTIONAL):** `envelope` object restricting what is allowed (e.g., `currency`, `max_amount_minor`, `merchant_id`, `shipping_country`, `mcc`, `max_uses`, etc.).

**Assurance requirements/results (OPTIONAL):** `assurance` object that can include:
- requirements:
  - `min_pohp` (minimum HAPP Proof-of-Human-Presence level)
  - `accepted_pp_profiles` (allowlist of HAPP profiles)
  - `freshness_seconds` (max age of the most recent approval)
- results (in granted capability):
  - `achieved_pohp`
  - `pp_profile`
  - `approved_at` (timestamp)
  - `happ_cc_id` (opaque reference to HAPP consent credential / approval event)

> Note: RFC 9396 permits deployments to define machine-readable schemas for authorization details types and to use a schema identifier as the `type` value; this profile follows that model.

---

### 4.2 wauth_requirements (template container)

`wauth_requirements` is a reusable template container for minimum acceptable authorization. It is intended for:
- policy authoring,
- documentation,
- publishing via metadata, and/or
- inclusion inside `wauth_required`.

Normative shape:
```json
{
  "authorization_details": [ { "type": "...WAUTH-ACTION...", "...": "..." } ],
  "requirements_id": "optional-stable-id",
  "expires_at": "optional-ISO-8601"
}
```

Rules:
- `authorization_details` MUST be an array as defined by RFC 9396.
- Each WAUTH-ACTION object in `authorization_details` MUST follow §4.1.
- In a pure template, `action_hash` SHOULD be omitted (since it is request-specific).

---

### 4.3 wauth_binding (per-request binding object)

`wauth_binding` binds a requirements response to a specific concrete request.

Normative fields:
- `method` (REQUIRED): `"rp_action_hash"`
- `challenge_id` (REQUIRED): RP-generated identifier for correlation and replay prevention.
- `action_profile` (REQUIRED)
- `hash_alg` (REQUIRED): `"S256"`
- `action_hash` (REQUIRED): RP-computed hash for the *concrete request instance*.
- `nonce` (RECOMMENDED): Opaque random string for binding and freshness.
- `issued_at` (RECOMMENDED)
- `expires_at` (REQUIRED): short-lived expiry for the binding (e.g., 2–5 minutes).

Normative shape:
```json
{
  "method": "rp_action_hash",
  "challenge_id": "wauth-chal-...",
  "action_profile": "aaif.wauth.action....",
  "hash_alg": "S256",
  "action_hash": "base64url(SHA-256(JCS(action_instance)))",
  "nonce": "optional",
  "issued_at": "2026-02-27T12:00:00Z",
  "expires_at": "2026-02-27T12:05:00Z"
}
```

---

### 4.4 wauth_required (RP runtime denial envelope)

When an RP cannot execute a request due to missing/insufficient authorization, it returns `wauth_required`.

Normative fields:
- `error` (REQUIRED): `"wauth_required"`
- `authorization_details` (REQUIRED): RFC 9396 `authorization_details` array describing minimum acceptable authorization.
- `wauth_binding` (REQUIRED): Per-request binding object (§4.3).
- `transaction_id` (RECOMMENDED): RP correlation id for logs/support.
- `happ_challenge` (OPTIONAL): HAPP challenge object when RP requires step-up bound to this denial.

Normative HTTP behavior:
- Status code SHOULD be **403**.
- Response body MUST be JSON.
- Response MUST include `Cache-Control: no-store`.

Example:
```json
{
  "error": "wauth_required",
  "error_description": "Step-up required for checkout completion.",
  "transaction_id": "rp-4b9c2c3a",
  "authorization_details": [
    {
      "type": "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1",
      "actions": ["checkout_complete"],
      "locations": ["https://merchant.example/api/checkout/complete"],
      "action_profile": "aaif.wauth.action.acp.checkout_complete/v0.1",
      "hash_alg": "S256",
      "envelope": { "currency": "USD", "max_amount_minor": 100000, "merchant_id": "merchant_123", "max_uses": 1 },
      "assurance": { "min_pohp": 2, "accepted_pp_profiles": ["happ:eu-wallet","happ:iproov"], "freshness_seconds": 300 }
    }
  ],
  "wauth_binding": {
    "method": "rp_action_hash",
    "challenge_id": "wauth-chal-1f2d3c",
    "action_profile": "aaif.wauth.action.acp.checkout_complete/v0.1",
    "hash_alg": "S256",
    "action_hash": "mH7b0s6x5m2n4yT1k4pQeQ",
    "nonce": "n0nc3YH2XhN0Vw",
    "issued_at": "2026-02-27T12:00:00Z",
    "expires_at": "2026-02-27T12:05:00Z"
  }
}
```

---

## 5. Action hash computation (normative)

### 5.1 Inputs

- `action_profile`: identifies the canonicalization rules for this action type.
- `request`: the concrete HTTP request the RP is evaluating.

### 5.2 Algorithm

The RP MUST compute `action_hash` as follows:

1. Construct an **`action_instance`** object per `action_profile`.  
   - The action profile MUST define which request fields are included (e.g., path params, selected headers, request body fields, and any derived fields like `amount_minor`).
   - Fields not defined by the action profile MUST be excluded.
2. Canonicalize `action_instance` using **JCS** (RFC 8785) to produce `action_instance_c14n` (UTF-8 bytes).
3. Compute `digest = SHA-256(action_instance_c14n)`.
4. Encode `action_hash = base64url(digest)` without padding.
5. Return `action_hash`.

`hash_alg` MUST be `"S256"` for this profile.

---

## 6. RP behavior (normative)

### 6.1 Returning wauth_required

If the RP cannot execute a request because:
- no acceptable capability is presented, OR
- the capability fails verification, OR
- the capability does not cover the action parameters, OR
- step-up assurance requirements are not met,

then the RP MUST return a `wauth_required` response (§4.4) that includes:

- `authorization_details`: minimum acceptable WAUTH-ACTION objects (requirements).
- `wauth_binding`: containing RP-computed `action_hash` for the denied request and a short-lived `expires_at`.

### 6.2 Verifying an incoming capability

This section defines the minimum checks the RP MUST apply before executing the action.

#### 6.2.1 Token format and claims

If the capability is a JWT access token, the RP SHOULD require the token to conform to the JWT access token profile (RFC 9068) for interoperability between vendors.

At minimum, the RP MUST validate:
- signature using a trusted issuer key,
- `iss`, `aud`, `exp` (and `nbf`/`iat` if present),
- and `jti` presence (see §6.2.4).

#### 6.2.2 Sender constraint (RECOMMENDED: DPoP)

For this profile, sender-constraining is RECOMMENDED using **DPoP** (RFC 9449).

When DPoP is required by local policy:

- The RP MUST require:
  - `Authorization: DPoP <token>`
  - `DPoP: <dpop_proof_jwt>`

- The RP MUST validate the DPoP proof per RFC 9449, including at least:
  - header `typ` equals `dpop+jwt`,
  - `alg` is asymmetric and not `none`,
  - signature verifies with the `jwk` in the header,
  - payload includes `jti`, `htm`, `htu`, `iat`,
  - `htm` and `htu` match the current request,
  - `iat` is within an acceptable time window,
  - `ath` equals base64url(SHA-256(access_token_value)) for protected resource requests,
  - and the access token is bound to the same key as in the DPoP proof (e.g., via `cnf.jkt`).

#### 6.2.3 Requirements satisfaction

Let:
- `R` be the set of WAUTH-ACTION requirement objects from the RP (either preconfigured policy or the current `wauth_required` message).
- `G` be the set of WAUTH-ACTION grant objects in the presented token’s `authorization_details`.

For each requirement object `r ∈ R`, the RP MUST find at least one grant object `g ∈ G` such that:

1) `g.type == r.type` (WAUTH-ACTION type)  
2) `g.actions` covers the required action identifier (or a locally-defined equivalent mapping)  
3) `g.locations` contains the current resource indicator/URI (or a locally-defined mapping)  
4) `g.action_profile == r.action_profile`  
5) `g.hash_alg == "S256"`

#### 6.2.4 Action binding (anti-swapping)

The RP MUST compute `action_hash_req = ComputeActionHash(request, g.action_profile)` (§5) and MUST verify:

- `g.action_hash` is present; and
- `g.action_hash == action_hash_req`

If the RP provided a `wauth_binding` challenge earlier, the RP SHOULD also verify that the token includes binding hints (e.g., `challenge_id` and/or `nonce`) matching the active challenge, and that the binding is not expired.

#### 6.2.5 Envelope enforcement (exact satisfaction algorithm)

For a given request and matched grant object `g`, define `A` as the set of action parameters extracted from the request per `action_profile`.

The RP MUST enforce each present envelope constraint in `g.envelope` as follows:

- If `g.envelope.currency` is present: `A.currency` MUST equal it.
- If `g.envelope.max_amount_minor` is present: `A.amount_minor` MUST be ≤ it.
- If `g.envelope.merchant_id` is present: `A.merchant_id` MUST equal it.
- If `g.envelope.mcc` is present: `A.mcc` MUST equal it.
- If `g.envelope.shipping_country` is present: `A.shipping_country` MUST equal it.
- If `g.envelope.max_uses` is present:
  - For this profile, `max_uses` MUST be 1, and the RP MUST enforce single-use via `jti` (see §6.2.6).

If any enforced constraint fails, the RP MUST reject and respond with `wauth_required`.

> Stateful / cumulative constraints (e.g., `max_total_amount_minor`) are not REQUIRED to be enforced by the RP in this profile unless the RP is able to maintain the necessary ledger state. If present, such constraints SHOULD be enforced by the WAS by minting per-action capabilities whose per-action envelopes never exceed remaining allowance.

#### 6.2.6 Replay prevention (minimum requirement)

The RP MUST prevent replay of accepted capabilities:

- The capability token MUST contain a `jti`.
- The RP MUST maintain a replay cache keyed by `(iss, jti)` (or another collision-resistant key) and MUST reject any request reusing a previously accepted `jti`.
- The RP MUST retain the replay cache entry at least until the earlier of:
  - token expiry (`exp`), or
  - a local maximum TTL, but NOT less than the expected maximum propagation delay in the RP deployment.

For horizontally scaled RPs, the replay cache MUST be shared or otherwise consistent across instances such that a `jti` cannot be replayed against a different instance.

For DPoP proofs, the RP SHOULD also track DPoP proof `jti` values within the accepted time window for replay detection, per RFC 9449 guidance.

---

## 7. Assurance enforcement (exact satisfaction algorithm)

If the RP requires step-up assurance, it expresses it as:

- `r.assurance.min_pohp`
- `r.assurance.accepted_pp_profiles`
- `r.assurance.freshness_seconds`

A granted capability MAY include `g.assurance.achieved_pohp`, `g.assurance.pp_profile`, and `g.assurance.approved_at`.

If `r.assurance` is present, the RP MUST verify:

1) `g.assurance.achieved_pohp` is present and `>= r.assurance.min_pohp`
2) If `r.assurance.accepted_pp_profiles` is present: `g.assurance.pp_profile` MUST be one of them
3) If `r.assurance.freshness_seconds` is present:
   - `g.assurance.approved_at` MUST be present
   - `(now - approved_at) <= freshness_seconds`

If any check fails, the RP MUST return `wauth_required` including the same assurance requirements (and MAY include a `happ_challenge` to bind the new approval to this request).

---

## 8. Client behavior (normative)

Upon receiving `wauth_required`, the client MUST:

1) Treat the denied request as not executed.
2) Extract `authorization_details` and `wauth_binding`.
3) Obtain a new capability from a WAS such that:
   - the granted `authorization_details` satisfy the requirements, AND
   - the granted `action_hash` equals the RP-provided `wauth_binding.action_hash`, AND
   - the capability validity window does not exceed `wauth_binding.expires_at`.
4) Retry the request with the capability and (if required) DPoP proof.

The method by which the client obtains a capability (MCP tool call vs OAuth token endpoint) is out of scope of this profile; however, the input object used to request a capability SHOULD embed the RP-provided `authorization_details` and `wauth_binding` unchanged.

---

## 9. Worked example (DPoP-protected request)

### 9.1 Initial request (insufficient authorization)

```http
POST /api/checkout/complete HTTP/1.1
Host: merchant.example
Content-Type: application/json

{"checkout_session_id":"cs_123","amount_minor":19999,"currency":"USD"}
```

### 9.2 RP denies with wauth_required

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
Cache-Control: no-store

{ ... wauth_required JSON from §4.4 ... }
```

### 9.3 Retried request with capability + DPoP

```http
POST /api/checkout/complete HTTP/1.1
Host: merchant.example
Content-Type: application/json
Authorization: DPoP eyJhbGciOiJSUzI1NiIsInR5cCI6ImF0K2p3dCJ9...
DPoP: eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2IiwiandrIjp7...}}.eyJqdGkiOiJlMWozVl9iS2ljOC1MQUVCIiwiaHRtIjoiUE9TVCIsImh0dSI6Imh0dHBzOi8vbWVyY2hhbnQuZXhhbXBsZS9hcGkvY2hlY2tvdXQvY29tcGxldGUiLCJpYXQiOjE3MTAwMDAwMDAsImF0aCI6IkFUSF9IQVNIX0VYQU1QTEUifQ....

{"checkout_session_id":"cs_123","amount_minor":19999,"currency":"USD"}
```

**DPoP proof payload requirements (normative):**
- `jti`, `htm`, `htu`, `iat` MUST be present.
- `ath` MUST be present for protected resource requests and equals `base64url(SHA-256(access_token_value))`.

The RP validates the DPoP proof and capability per §6, computes `action_hash` for the request, matches it to the capability’s `authorization_details[].action_hash`, checks envelope and assurance, consumes `jti`, and executes.

---

## 10. Security considerations (profile-specific)

- This profile is explicitly designed to avoid trusting the client/agent to invoke step-up. The RP enforces requirements at the boundary by refusing execution until it receives a verifiable capability.
- The `wauth_binding.action_hash` pattern provides strong anti-swapping at the RP boundary by binding authorization to the exact concrete request.
- RFC 9396 notes that `authorization_details` can be vulnerable to tampering/swapping in user-agent mediated flows; the binding and short-lived challenges in this profile reduce the impact of swapping at the execution boundary and complement request-object protections.



---

## References

- RFC 2119: Key words for use in RFCs to Indicate Requirement Levels (BCP 14)
- RFC 8174: Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words (BCP 14)
- RFC 8785: JSON Canonicalization Scheme (JCS)
- RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens
- RFC 9396: OAuth 2.0 Rich Authorization Requests (RAR)
- RFC 9449: OAuth 2.0 Demonstrating Proof of Possession (DPoP)

