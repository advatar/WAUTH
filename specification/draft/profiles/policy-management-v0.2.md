# WAUTH-POLICY-MGMT v0.2

Status: Draft

This profile standardizes the policy interface for WAUTH deployments.

## Contract

Input: `schemas/wauth-policy-context.v0.2.schema.json`
Output: `schemas/wauth-policy-decision.v0.1.schema.json`
Optional packaging: `schemas/wauth-policy-bundle.v0.1.schema.json`

## Decision values

- `permit`
- `deny`
- `wauth_required`

If decision is `wauth_required`, the output MUST include RFC 9396-compatible `authorization_details`.

## DSL guidance

WAUTH does not require one DSL. CEL, Rego, Cedar, NGAC-style graphs, or proprietary PDPs can be used as long as they map into the standard policy input/output contract.


## Extended policy inputs in v0.5.1

When available, policy context SHOULD also carry requester identity continuity, instruction-source integrity facts, execution budgets, expected postconditions, and multi-agent link facts.
