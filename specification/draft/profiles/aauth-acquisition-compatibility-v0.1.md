# WAUTH-AAUTH-ACQ v0.1

Status: Draft

This informative profile explains how browserless OAuth acquisition profiles such as AAuth can be composed with WAUTH.

## Principle

AAuth-like profiles may obtain an upstream grant or user-linked authorization in chat/voice/browserless channels. WAUTH remains responsible for:
- RP requirement signaling
- action binding
- replay resistance
- capability verification at the execution boundary

## Guidance

Treat AAuth as an optional **acquisition profile**, not as a replacement for WAUTH capabilities. High-impact execution SHOULD rely on WAUTH-CAP or equivalent structured, action-bound authorization.
