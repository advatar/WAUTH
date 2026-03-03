# WAUTH-LIFECYCLE-SCIM v0.1

Status: Draft

This profile defines lifecycle events and an optional SCIM mapping for agent registration, suspension, rotation, revocation, and deletion.

## Normative objects

- `schemas/wauth-lifecycle-event.v0.1.schema.json`
- `schemas/wauth-scim-agent-extension.v0.1.schema.json`

## Event types

- `register`
- `activate`
- `rotate`
- `suspend`
- `resume`
- `revoke`
- `delete`
- `owner_change`
- `policy_change`

## Required behavior

- suspended, revoked, or deleted agents MUST NOT receive new capabilities
- key rotation MUST update `jkt` bindings and lifecycle state
- lifecycle changes SHOULD be reflected into provenance/receipt records for auditability
