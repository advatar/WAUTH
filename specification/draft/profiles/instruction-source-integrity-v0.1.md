# WAUTH-INSTRUCTION-SOURCE-INTEGRITY v0.1

Status: Draft

This profile defines trust classes and promotion rules for sources that may influence agent behavior across turns or sessions.

## Normative object

- `schemas/wauth-instruction-source.v0.1.schema.json`

## Required behavior

- externally editable or unreviewed sources default to `data` or `untrusted`
- memory references, shared documents, gists, and tool outputs MUST NOT silently become authoritative policy
- promotion from data/reference into instruction or policy requires explicit approval and SHOULD emit a provenance event
