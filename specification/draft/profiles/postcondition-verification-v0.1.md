# WAUTH-POSTCONDITION v0.1

Status: Draft

This profile distinguishes claimed success from verified outcome and standardizes receipts for postcondition checks.

## Normative object

- `schemas/wauth-postcondition-receipt.v0.1.schema.json`

## Required behavior

- high-impact actions distinguish agent-claimed success from verified outcome
- failed or unknown postconditions remain visible in receipts and downstream policy
- receipts SHOULD bind back to the relevant capability, action hash, and resulting state
