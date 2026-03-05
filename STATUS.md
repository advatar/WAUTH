# Status

## Current Task: Build end-to-end ChatGPT MCP demo backend

- [x] Expose `aaif.wauth.request/get/metadata` tools in `demo/wauth-demo-ts` MCP server with persisted request/artifact state
- [x] Add discovery/JWKS HTTP endpoints used by `aaif.wauth.metadata` (`/.well-known/aaif-wauth-configuration`, `/jwks`)
- [x] Replace placeholder iProov URL with real demo approval endpoint and HTML approval flow
- [x] Auto-advance workflow after approval so flow continues until the next required human checkpoint
- [x] Add/extend tests for workflow progression and WAUTH MCP state transitions
- [x] Update demo docs for ChatGPT end-to-end usage and approval URL behavior
- [x] Validate with package tests and full SDK conformance suite
