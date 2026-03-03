# WAUTH-WORKLOAD-ID v0.1

Status: Draft

This profile defines a portable way to describe agent identity metadata and workload attestation in WAUTH deployments.

## Goals

- separate stable agent identity from ephemeral runtime/task identity
- bind proof-of-possession keys to software/workload identity
- allow enterprise and cloud environments to reuse SPIFFE/SPIRE, X.509, enclave, or other attestation systems

## Normative objects

- `schemas/wauth-agent-identity.v0.1.schema.json`
- `schemas/wauth-attestation-evidence.v0.1.schema.json`

## Minimum fields

A WAUTH-AGENT object distinguishes:
- `agent_id` (stable)
- `instance_id` (ephemeral runtime identity)
- `task_id` (ephemeral task identity)
- `owner` (accountable human or organization)
- `org_boundary` (tenant / org scope)
- `software_identity` (image digest, signer, version)
- `workload_identity` (SPIFFE ID, DID, OAuth client_id, or equivalent)

A WAUTH-ATTEST object binds the presented key to the workload identity using attestation evidence.

## RP behavior

When required by policy, an RP verifies that:
1. the capability was signed or sender-constrained by the bound key,
2. the key matches the attested or workload-identity-backed key, and
3. attestation freshness and boundary requirements are satisfied.
