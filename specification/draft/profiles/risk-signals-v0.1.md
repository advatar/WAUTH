# WAUTH-RISK-SIGNALS v0.1

Status: Draft

This profile defines how prompt-safety and other risk signals are exchanged and fed into WAUTH policy decisions.

## Normative object

- `schemas/wauth-risk-signals.v0.1.schema.json`

## Scope

This profile does not standardize detection algorithms. It standardizes:
- how risk facts are represented
- how those facts enter policy
- how systems fail safe when high-risk facts are missing or suspicious

## Example signals

- prompt origin trust
- source trust / provenance confidence
- tool trust level
- suspected prompt-injection indicators
- aggregate sensitivity labels
- recommended action (`permit`, `step_up`, `deny`)
