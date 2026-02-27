# WAUTH Profile: Protected Resource Metadata Advertisement (WAUTH-RP-PRM) v0.1

**Status:** Draft (non-final).  
**Intended audience:** Relying Parties / Resource Servers (RPs/RSs), gateways, Agent Hosts, platform vendors.

This profile specifies how a relying party (protected resource) advertises that it supports WAUTH, and how it publishes machine-readable “lock information” up front so integrators can discover:

- which authorization servers to use,
- whether the RP supports **WAUTH-RP-REQSIG** runtime requirement signaling,
- which capability formats and authorization detail types the RP accepts,
- optional pointers to requirement templates for preflight acquisition.

This profile is designed to compose with:

- **OAuth 2.0 Protected Resource Metadata (RFC 9728)** as the discovery envelope, and
- **OAuth 2.0 Rich Authorization Requests (RFC 9396)** as the requirements/grants structure (`authorization_details`).

---

## 1. Conventions and normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in **BCP 14** (RFC 2119 and RFC 8174).

---

## 2. Roles

- **Protected Resource / RP:** The endpoint that executes business actions and enforces authorization at the execution boundary.
- **Client / Agent Host:** Initiates calls to the RP.
- **Authorization Server (AS):** Issues OAuth tokens used to call the RP (optional but common).
- **WAS (Wallet Authorization Service):** Issues WAUTH capabilities; may be integrated with or separate from an AS.

---

## 3. Profile identifier

- `aaif.wauth.profile.rp-protected-resource-metadata/v0.1`

---

## 4. Baseline RFC 9728 requirements

An RP conforming to this profile MUST publish an RFC 9728 Protected Resource Metadata document at the well-known location derived from its resource identifier.

For the default suffix, this is:

- `/.well-known/oauth-protected-resource` (or the path-variant for multi-resource hosts)

The metadata document MUST include at least:

- `resource` (REQUIRED by RFC 9728)
- `authorization_servers` (RECOMMENDED when OAuth/OIDC is used)

The RP MUST follow RFC 9728 validation rules (notably: the returned `resource` value MUST exactly match the resource identifier used to form the metadata URL).

---

## 5. WAUTH extension

### 5.1 `wauth` object (MUST)

The RFC 9728 metadata JSON object MUST include a top-level `wauth` member containing a WAUTH extension object.

The `wauth` object MUST validate against:

- `schemas/wauth-prm-extension.v0.1.schema.json`

Minimum required fields:

- `supported: true`
- `profiles_supported` (array of strings)
- `authorization_details_types_supported` (array of strings/URIs)
- `capability_formats_supported` (array of strings)

If the RP emits `wauth_required` responses, `profiles_supported` MUST include:

- `aaif.wauth.profile.rp-requirements-signaling/v0.1`

### 5.2 Optional pointers for preflight integration

The `wauth` object MAY include:

- `requirements_uri` — URL returning a `wauth_requirements` template document (no per-request binding)
- `policy_uri` — human-readable policy documentation (often redundant with RFC 9728 `resource_policy_uri`)

If `requirements_uri` is present, the referenced resource MUST return a JSON object validating against:

- `schemas/wauth-requirements.v0.1.schema.json`

and MUST NOT include per-request binding fields such as `action_hash`.

---

## 6. Example Protected Resource Metadata document (informative)

```json
{
  "resource": "https://merchant.example/api",
  "authorization_servers": ["https://login.merchant.example"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["checkout:read", "checkout:complete"],

  "wauth": {
    "supported": true,
    "profiles_supported": [
      "aaif.wauth.profile.rp-protected-resource-metadata/v0.1",
      "aaif.wauth.profile.rp-requirements-signaling/v0.1"
    ],
    "capability_formats_supported": ["jwt+rfc9068"],
    "authorization_details_types_supported": [
      "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1"
    ],
    "sender_constraint_methods_supported": ["dpop"],
    "requirements_uri": "https://merchant.example/.well-known/wauth-requirements"
  }
}
```

---

## 7. Security and operational considerations

- **Impersonation defense:** Consumers MUST validate `resource` exactly per RFC 9728 before trusting any other metadata values.
- **Caching:** RPs SHOULD provide cache headers; consumers SHOULD cache and revalidate.
- **SSRF:** Consumers fetching metadata must apply SSRF protections (block local IPs, validate scheme/host, etc.), as discussed in RFC 9728.
- **Change management:** If an RP rotates accepted capability formats or types, it SHOULD deploy overlaps and honor cached metadata for a bounded transition window.

---

## 8. Interactions with MCP (informative)

MCP servers are required to publish RFC 9728 metadata for authorization server discovery. WAUTH-RP-PRM is intentionally compatible with this mechanism: the same protected resource metadata document can advertise both:

- OAuth authorization server locations, and
- WAUTH support and requirements signaling capabilities.