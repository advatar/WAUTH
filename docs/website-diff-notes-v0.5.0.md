# Website diff notes for WAUTH v0.5.0

Update the existing WAUTH landing page to reflect the v0.5.0 spec set.

## Must-change items

1. Update all version badges and status labels to **v0.5.0**.
2. In Overview and Status, add the new enterprise-control profiles:
   - WAUTH-WORKLOAD-ID
   - WAUTH-LIFECYCLE-SCIM
   - WAUTH-PROVENANCE
   - WAUTH-RISK-SIGNALS
   - WAUTH-AAUTH-ACQ (compatibility / optional)
3. In Model Overview, add a third visual block explaining:
   - agent identity metadata + workload attestation
   - lifecycle / revocation propagation
   - provenance event chains
   - risk signals feeding policy
4. In Core Components, add cards or callouts for:
   - WAUTH-AGENT
   - WAUTH-ATTEST
   - WAUTH-LIFECYCLE-EVT
   - WAUTH-EVT
   - WAUTH-RISK
5. In Conformance, add the new classes:
   - WAS-WORKLOAD-ID
   - WAS-LIFECYCLE
   - WAS-POLICY
   - WAS-PROVENANCE
   - WAS-RISK
   - RP-WORKLOAD-ID
   - RP-RISK
6. In Security and Privacy, explicitly state:
   - WAUTH contains prompt-injection risk through policy and containment hooks; it does not claim to detect or prevent all prompt injection.
   - provenance should prefer hashes/references over storing raw prompts.
7. In FAQ, add answers for:
   - Do I need SPIFFE or SCIM? (No, both are optional compatibility profiles.)
   - Does WAUTH replace OAuth/OIDC? (No.)
   - Does WAUTH replace HAPP? (No, HAPP is step-up.)
   - Where does AAuth fit? (Optional upstream acquisition profile.)

## Suggested new callout

Add a prominent callout under Motivation or Core Components:

> **v0.5.0 closes the enterprise control loop:** agent identity, strong authentication, lifecycle, policy, provenance, and prompt-safety containment now all share one authorization boundary model.
