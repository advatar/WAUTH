# WAUTH RP Requirement Signaling (v0.1)

This folder contains **drop-in JSON Schemas** and **examples** for an RP→Client signaling pattern:

- RP denies an execution request with `error = "wauth_required"`.
- RP includes an RFC 9396-compatible `authorization_details` array that describes the **required** authorization.
- For per-request action binding, RP also includes a `wauth_binding` object with an `action_hash` computed by the RP over the concrete request.
- The client obtains a short-lived capability token from a WAUTH Wallet Authorization Service (WAS), and retries the request with that token.
- RP verifies: JWT signature + `aud` + `exp` + replay (`jti`) + PoP binding (`cnf.jkt` / DPoP) + `authorization_details` satisfy requirements + request hashes to `action_hash`.

Files:
- `schemas/wauth-required.v0.2.schema.json` — RP error response
- `schemas/wauth-binding.v0.1.schema.json` — action binding object
- `schemas/wauth-requirements.v0.1.schema.json` — requirements wrapper (non-OAuth contexts)
- `schemas/wauth-action-requirements-details.v0.1.schema.json` — requirements template (action_hash optional)
- `schemas/wauth-action-authorization-details.v0.1.schema.json` — granted capability (action_hash required)

Examples:
- `examples/rp-wauth-required-example.json` — full denial response
- `examples/wauth-requirements-template-example.json` — reusable policy template
- `examples/capability-token-payload-example.json` — JWT payload example carrying `authorization_details`
