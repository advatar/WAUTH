import { describe, expect, it } from "vitest";

import { wellKnownWauthConfigUrl } from "../src/discovery.js";
import {
  buildWauthGet,
  buildWauthMetadata,
  buildWauthRequest,
  extractArtifactRefs,
  extractElicitations,
  parseWauthMetadata,
  parseWauthResultEnvelope
} from "../src/mcp.js";
import { validateCapabilityClaims } from "../src/rp.js";

describe("wauth-ts helpers", () => {
  it("builds canonical MCP requests for request/get/metadata", () => {
    const request = buildWauthRequest({ walletIntent: { profile: "x" } }, { requestId: "req-1" });
    const getRequest = buildWauthGet("artifact://cap/123");
    const metadataRequest = buildWauthMetadata();

    expect(request.name).toBe("aaif.wauth.request");
    expect(request.arguments.requestId).toBe("req-1");
    expect(getRequest).toEqual({
      name: "aaif.wauth.get",
      arguments: { ref: "artifact://cap/123" }
    });
    expect(metadataRequest).toEqual({
      name: "aaif.wauth.metadata",
      arguments: {}
    });
  });

  it("extracts elicitations from error payload", () => {
    const payload = {
      code: -32042,
      data: {
        elicitations: [{ mode: "url", url: "https://issuer.example/approve" }]
      }
    };
    expect(extractElicitations(payload)).toHaveLength(1);
  });

  it("parses WAUTH result envelope and artifact refs", () => {
    const result = {
      structuredContent: {
        version: "0.1",
        requestId: "req-1",
        artifacts: [
          { kind: "WAUTH-CAP", format: "jwt", ref: "artifact://cap/123" },
          { kind: "WAUTH-REC", format: "json", inline: { event_id: "evt-1" } }
        ]
      }
    };

    const envelope = parseWauthResultEnvelope(result);
    expect(envelope.requestId).toBe("req-1");
    expect(extractArtifactRefs(envelope)).toEqual(["artifact://cap/123"]);
  });

  it("parses WAUTH metadata response", () => {
    const metadata = parseWauthMetadata({
      structuredContent: {
        issuer: "https://wauth.example",
        jwks_uri: "https://wauth.example/jwks",
        wauth_versions_supported: ["0.5.1"],
        intent_versions_supported: ["0.2"],
        profiles_supported: ["wauth-rp-reqsig/v0.1"],
        formats_supported: ["jwt"],
        mcp: {
          tool_namespaces_supported: ["aaif.wauth"],
          tools_supported: ["aaif.wauth.request", "aaif.wauth.get", "aaif.wauth.metadata"]
        }
      }
    });

    expect(metadata.issuer).toBe("https://wauth.example");
    expect(metadata.jwks_uri).toBe("https://wauth.example/jwks");
  });

  it("validates capability claims for RP-side checks", () => {
    const result = validateCapabilityClaims({
      claims: {
        aud: "https://rp.example/api/payments",
        exp: 2000000000,
        iat: 1999999000,
        jti: "jti-1",
        action_hash: "sha256:test"
      },
      expectedAudience: "https://rp.example/api/payments",
      expectedActionHash: "sha256:test",
      nowEpochSeconds: 1999999500
    });

    expect(result.ok).toBe(true);
    expect(result.replayKey).toBe("jti-1");
  });

  it("builds the well-known WAUTH-CONFIG URL", () => {
    expect(wellKnownWauthConfigUrl("https://issuer.example/")).toBe(
      "https://issuer.example/.well-known/aaif-wauth-configuration"
    );
  });
});
