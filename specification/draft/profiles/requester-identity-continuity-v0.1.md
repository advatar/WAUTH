# WAUTH-REQUESTER-CONTINUITY v0.1

Status: Draft

This profile defines how deployments preserve requester identity continuity and requester authorization for privileged or side-effecting actions.

## Normative object

- `schemas/wauth-requester-context.v0.1.schema.json`

## Core idea

The agent and the RP may both be secure while the **requester** is weakly authenticated. This profile makes “who is allowed to command the agent” an explicit security boundary.

## Required behavior

- conversational cues such as display names, avatars, tone, urgency, or familiarity are non-authoritative
- privileged actions require a stable requester identifier, verifier-backed assertion, or fresh step-up
- channel/session changes that break continuity MUST trigger re-verification or step-up
- requester roles such as `owner`, `operator`, or `delegate` MUST be expressible to policy
