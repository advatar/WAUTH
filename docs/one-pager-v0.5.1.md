# AAIF Wallet Authorization Protocol (WAuth) v0.5.1 — One-pager

## Overview

WAuth standardizes how autonomous agents receive, constrain, and prove delegated authority **without exposing human root keys**. The core protocol remains:

- **WAUTH-INTENT** — ask for authority
- **WAUTH-ENVELOPE** — bound authority
- **WAUTH-MANDATE** — reusable grant
- **WAUTH-CAP** — short-lived action-bound capability
- **WAUTH-CONFIG** — discovery and verification metadata

Version **0.5.1** adds five **optional operational-safety profiles** informed by deployed-agent failure modes: requester spoofing, mutable memory becoming policy, persistent side effects, “claimed success” without verified state change, and multi-agent amplification.

## Why this matters

Endpoints are the locks. Agents are not trusted. WAuth gives endpoints a way to demand stronger authorization, and v0.5.1 adds a way to reason about **who is allowed to command the agent**, **what sources count as instructions**, **what side effects are allowed**, and **how multi-agent trust is contained**.

## New profiles in v0.5.1

- **WAUTH-REQUESTER-CONTINUITY** — requester identity continuity and requester authorization for privileged actions
- **WAUTH-INSTRUCTION-SOURCE-INTEGRITY** — trust classes and promotion rules for instruction-bearing sources
- **WAUTH-EXEC-BUDGETS** — execution budgets and persistent side-effect controls
- **WAUTH-POSTCONDITION** — verified outcomes and tool/RP receipts
- **WAUTH-MULTI-AGENT-TRUST** — multi-agent delegation, provenance, and anti-amplification

## Core clarification

WAuth core now states explicitly:

> Privileged or side-effecting actions MUST NOT rely on display names, tone, urgency, or other conversational cues alone.

## Relationship to HAPP and OpenID

- **HAPP** provides fresh human approval / presence when policy requires step-up.
- **OpenID4VCI / OpenID4VP** provide credential issuance/presentation bridges.
- **WAuth** remains the execution-boundary authorization layer for agents.
