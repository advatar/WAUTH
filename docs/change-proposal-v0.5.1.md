# WAUTH v0.5.1 Change Proposal

## Summary

This change proposal adds five new operational-safety profiles informed by deployed-agent failure modes, while preserving the **core WAUTH protocol** (Intent, Envelope, Mandate, Capability, Discovery, RP verification, MCP delivery, HAPP composition).

## New profiles

| Profile | Abstract | Recommendation |
|---|---|---|
| **WAUTH-REQUESTER-CONTINUITY** | Preserves requester identity continuity across channels/sessions and separates requester authentication from requester authorization for privileged actions. | **Core-adjacent**: optional profile, but deployments that accept requester-driven privileged commands SHOULD claim it. |
| **WAUTH-INSTRUCTION-SOURCE-INTEGRITY** | Prevents mutable memory, gists, tool outputs, and shared documents from silently becoming authoritative instructions or policy. | **Optional profile**: strongly recommended for stateful agents or agents that load cross-session memory/instructions. |
| **WAUTH-EXEC-BUDGETS** | Constrains runtime, storage, network, and persistent side effects; makes background jobs and indefinite processes explicitly authorized. | **Optional profile**: strongly recommended for tool-using agents and agent hosts that can create infrastructure side effects. |
| **WAUTH-POSTCONDITION** | Distinguishes claimed success from verified outcome and standardizes receipts for postcondition checks. | **Optional profile**: strongly recommended for destructive, stateful, or compliance-relevant actions. |
| **WAUTH-MULTI-AGENT-TRUST** | Preserves delegation/provenance across agent hops and blocks circular corroboration or implicit transitive trust. | **Optional profile**: strongly recommended wherever one agent can influence or trigger another. |

## One core clarification

WAuth core now states explicitly that privileged or side-effecting actions MUST NOT rely on conversational authority cues alone. Display names, tone, urgency, or familiarity are **non-authoritative cues**.

## Core vs optional

- **Core remains unchanged** in structure: Intent, Envelope, Mandate, Capability, Discovery, RP verification.
- **Profiles are opt-in** and claimed through conformance classes and metadata.
- **v0.5.1 also fixes the earlier ambiguity**: enterprise safety additions are profiles, not blanket mandatory core requirements.
