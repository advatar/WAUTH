# WAUTH website update notes (from previous WAUTH landing page)

If you already have an earlier WAUTH landing page (pre v0.4.0), update it as follows:

1) **Version + status**
- Update all version labels to **v0.4.0**
- Add a “Profiles” status line:
  - RP-REQSIG v0.1
  - RP-PRM v0.1
  - Policy Mgmt Guidance v0.1

2) **Model Overview**
- Add the RP node explicitly (“locks”) and show the RP→WAS verification relationship.
- Add a dedicated sequence diagram for runtime requirement signaling:
  - RP returns `wauth_required`
  - Agent invokes WAS
  - Optional HAPP step-up
  - Agent retries with WAUTH-CAP

3) **Core Components**
- Add “RP Adoption Profiles” subsection:
  - WAUTH-RP-REQSIG (runtime requirements signaling; `authorization_details`)
  - WAUTH-RP-PRM (RFC 9728 protected resource metadata + `wauth` extension)
- Add “Policy Management (proposal)” callout:
  - policy output = `permit | deny | wauth_required`
  - DSL options: CEL / OPA / Cedar

4) **MCP Interoperability**
- Mention optional `wauthRequired` forwarding mode for `aaif.wauth.request`.

5) **References**
- Add RFC 9728 explicitly.