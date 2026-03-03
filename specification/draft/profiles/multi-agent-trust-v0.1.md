# WAUTH-MULTI-AGENT-TRUST v0.1

Status: Draft

This profile defines delegation/provenance rules for systems where one agent can influence or trigger another.

## Normative object

- `schemas/wauth-agent-link.v0.1.schema.json`

## Required behavior

- transitive or circular corroboration is not sufficient authority
- provenance and delegated authority remain visible across agent hops
- shared channels are not trusted identity anchors by themselves
- multi-agent coordination SHOULD also be constrained by execution budgets
