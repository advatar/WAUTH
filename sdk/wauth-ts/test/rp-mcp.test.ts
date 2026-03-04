import { describe, expect, it } from "vitest";

import { wellKnownWauthConfigUrl } from "../src/discovery.js";
import {
  buildWauthGet,
  buildWauthGetFromArtifact,
  buildWauthMetadata,
  buildWauthOid4vciRequest,
  buildWauthOid4vpRequest,
  buildWauthReqSigForwardingRequest,
  buildWauthRequest,
  extractArtifactRefs,
  extractElicitations,
  metadataSupportsFormat,
  metadataSupportsNamespace,
  metadataSupportsProfile,
  metadataSupportsTool,
  metadataSupportsWauthVersion,
  parseWauthGetArtifact,
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

  it("builds canonical mode-specific request shapes", () => {
    const oid4vp = buildWauthOid4vpRequest(
      {
        oid4vpRequest: "openid-vp://request",
        mode: "direct_post",
        response_uri: "https://wallet.example/response"
      },
      { requestId: "req-vp-1" }
    );
    const oid4vci = buildWauthOid4vciRequest(
      {
        oid4vciOffer: "openid-credential-offer://offer"
      },
      { requestId: "req-vci-1" }
    );
    const reqsig = buildWauthReqSigForwardingRequest(
      {
        error: "insufficient_authorization"
      },
      { profile: "example-action", amount_minor: 1000 },
      { requestId: "req-rpsig-1" }
    );

    expect(oid4vp.arguments.mode).toBe("direct_post");
    expect(oid4vp.arguments.requestId).toBe("req-vp-1");
    expect(oid4vci.arguments.requestId).toBe("req-vci-1");
    expect(reqsig.arguments.requestId).toBe("req-rpsig-1");
    expect(reqsig.arguments.wauthRequired).toEqual({ error: "insufficient_authorization" });
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

  it("builds get calls from artifacts and parses get responses", () => {
    const getRequest = buildWauthGetFromArtifact({
      kind: "WAUTH-CAP",
      format: "jwt",
      ref: "artifact://cap/999"
    });
    expect(getRequest).toEqual({
      name: "aaif.wauth.get",
      arguments: { ref: "artifact://cap/999" }
    });

    const artifact = parseWauthGetArtifact(
      {
        structuredContent: {
          kind: "WAUTH-CAP",
          format: "jwt",
          inline: { token: "jwt-value" }
        }
      },
      { expectedKind: "WAUTH-CAP", expectedFormat: "jwt" }
    );
    expect(artifact.kind).toBe("WAUTH-CAP");
    expect(artifact.format).toBe("jwt");
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
    expect(metadataSupportsTool(metadata, "aaif.wauth.request")).toBe(true);
    expect(metadataSupportsNamespace(metadata, "aaif.wauth")).toBe(true);
    expect(metadataSupportsProfile(metadata, "wauth-rp-reqsig/v0.1")).toBe(true);
    expect(metadataSupportsFormat(metadata, "jwt")).toBe(true);
    expect(metadataSupportsWauthVersion(metadata, "0.5.1")).toBe(true);
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
