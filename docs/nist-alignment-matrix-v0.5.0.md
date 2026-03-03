# WAUTH v0.5.0 - NIST concept-paper alignment matrix

This note maps the main question clusters from the NIST/NCCoE concept paper to WAUTH v0.5.0 deliverables.

| NIST question cluster | WAUTH v0.5.0 answer |
|---|---|
| Identification | WAUTH-WORKLOAD-ID defines WAUTH-AGENT and WAUTH-ATTEST, distinguishing stable agent IDs, ephemeral instance/task IDs, workload identity, software identity, and organizational boundaries. |
| Authentication and key management | WAUTH-WORKLOAD-ID + WAUTH-LIFECYCLE-SCIM define strong agent authentication, key binding, rotation, suspension, revocation, and deletion. |
| Zero-trust authorization | Core WAUTH artifacts, WAUTH-RP-REQSIG, and WAUTH-RP-PRM let the RP demand exact authorization at the execution boundary. |
| Dynamic policy and least privilege | WAUTH-POLICY-MGMT standardizes policy inputs/outputs; envelopes, requirements, and risk signals allow dynamic narrowing and step-up. |
| Proving authority for a specific action / conveying intent | WAUTH-CAP, `action_hash`, and RFC 9396-based requirements/grants bind authority to one exact action instance. |
| Delegation and human-in-the-loop | WAUTH-MANDATE + HAPP step-up provide bounded delegation and human approval. |
| Auditing and non-repudiation | WAUTH-PROVENANCE defines chained event logging and binding to human approvals and RP receipts. |
| Prompt injection prevention / mitigation | WAUTH-RISK-SIGNALS does not standardize detection, but standardizes risk interchange and fail-safe policy containment. |
