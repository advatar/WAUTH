# WAUTH (AAIF Wallet Authorization Protocol)

This repository contains the draft WAUTH specification, conformance notes, MCP profile, schemas, examples, test vectors, and website-supporting content.

## Latest draft in this repository

- Core spec: `specification/draft/wauth-v0.5.1.md`
- Conformance: `specification/draft/conformance-v0.5.1.md`
- MCP profile: `specification/draft/mcp-profile-v0.5.1.md`

## New in v0.5.1

The core mandate/capability protocol remains intact. Version 0.5.1 adds optional operational-safety profiles for:

- requester identity continuity and requester authorization
- instruction source integrity / mutable memory controls
- execution budgets and persistent side-effect controls
- postcondition verification / tool receipts
- multi-agent trust / anti-amplification

See `docs/change-proposal-v0.5.1.md` for a concise summary of what changed and why.
