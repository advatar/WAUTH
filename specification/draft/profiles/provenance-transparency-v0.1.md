# WAUTH-PROVENANCE v0.1

Status: Draft

This profile defines tamper-evident provenance and transparency events for WAUTH.

## Normative object

- `schemas/wauth-event.v0.1.schema.json`

## Goals

- link actions back to the acting agent identity
- link actions back to mandate/capability and human approval evidence
- track input sources and output hashes
- support chained, tamper-evident logging

## Minimum events

Implementations SHOULD emit events for:
- mandate issuance
- capability issuance
- HAPP step-up completion
- lifecycle changes
- RP execution result / receipt
- prompt / source registration
