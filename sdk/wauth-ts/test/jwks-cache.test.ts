import { describe, expect, it } from "vitest";

import { WauthJwksCache } from "../src/jwks.js";

describe("wauth-ts JWKS cache", () => {
  it("fetches metadata+jwks and caches entries by issuer", async () => {
    const calls: string[] = [];
    let now = 1_700_000_000;

    const cache = new WauthJwksCache({
      ttlSeconds: 300,
      nowEpochSeconds: () => now,
      fetchJson: async (url) => {
        calls.push(url);
        if (url.endsWith("/.well-known/aaif-wauth-configuration")) {
          return {
            issuer: "https://wauth.example",
            jwks_uri: "https://wauth.example/jwks",
            wauth_versions_supported: ["0.5.1"],
            intent_versions_supported: ["0.2"],
            profiles_supported: [],
            formats_supported: ["jwt"],
            mcp: {
              tool_namespaces_supported: ["aaif.wauth"],
              tools_supported: ["aaif.wauth.request"]
            }
          };
        }
        return {
          keys: [{ kid: "k1", kty: "RSA", e: "AQAB", n: "abc" }]
        };
      }
    });

    const first = await cache.getForIssuer("https://wauth.example");
    const second = await cache.getForIssuer("https://wauth.example");

    expect(first.keys?.[0]?.kid).toBe("k1");
    expect(second.keys?.[0]?.kid).toBe("k1");
    expect(calls).toHaveLength(2);

    now += 301;
    await cache.getForIssuer("https://wauth.example");
    expect(calls).toHaveLength(4);
  });

  it("refreshes once when kid is missing", async () => {
    const calls: string[] = [];
    let jwksVersion = 0;

    const cache = new WauthJwksCache({
      ttlSeconds: 300,
      fetchJson: async (url) => {
        calls.push(url);
        if (url.endsWith("/.well-known/aaif-wauth-configuration")) {
          return {
            issuer: "https://wauth.example",
            jwks_uri: "https://wauth.example/jwks",
            wauth_versions_supported: ["0.5.1"],
            intent_versions_supported: ["0.2"],
            profiles_supported: [],
            formats_supported: ["jwt"],
            mcp: {
              tool_namespaces_supported: ["aaif.wauth"],
              tools_supported: ["aaif.wauth.request"]
            }
          };
        }

        jwksVersion += 1;
        if (jwksVersion === 1) {
          return { keys: [{ kid: "old", kty: "RSA", e: "AQAB", n: "abc" }] };
        }
        return { keys: [{ kid: "new", kty: "RSA", e: "AQAB", n: "def" }] };
      }
    });

    const result = await cache.getForKid("https://wauth.example", "new");
    expect(result.key?.kid).toBe("new");
    expect(calls).toHaveLength(4);
  });
});
