# WAUTH Conformance Harness

This package defines the shared fixture contract consumed by language SDK tests.

## Contract

Each SDK should expose equivalent operations:

- `canonicalize_jcs(value)`
- `compute_action_hash(action_instance)`
- `check_envelope_monotonicity(parent, child)`
- `evaluate_requester_continuity(case)`
- `evaluate_instruction_source(case)`
- `evaluate_execution_budget(case)`
- `evaluate_postcondition(case)`
- `validate_provenance_chain(events)`
- `evaluate_risk_policy(case)`
- `evaluate_multi_agent_trust(case)`

## Source vectors

Vectors are loaded directly from repository roots:

- `test_vectors/v0.4/*.json`
- `test_vectors/v0.5/*.json`
