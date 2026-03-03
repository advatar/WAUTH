# WAUTH-EXEC-BUDGETS v0.1

Status: Draft

This profile constrains runtime, storage, network, and persistence side effects for agent actions.

## Normative object

- `schemas/wauth-exec-budget.v0.1.schema.json`

## Required behavior

- persistent processes and recurring schedules require explicit authority
- missing or exceeded budgets cause `deny` or `wauth_required`
- short conversational tasks MUST NOT silently become unbounded background processes
