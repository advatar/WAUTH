import { describe, expect, it } from "vitest";

import {
  normalizeKnownEnvVars,
  prepareRequestUrl,
  resolveMcpPathAlias
} from "../src/serverless-routing.js";

describe("resolveMcpPathAlias", () => {
  it("maps public no-auth aliases to MCP endpoints", () => {
    expect(resolveMcpPathAlias("/api/mcp-open")).toBe("/api/mcp");
    expect(resolveMcpPathAlias("/api/mcp-noauth")).toBe("/api/mcp");
    expect(resolveMcpPathAlias("/mcp-open")).toBe("/mcp");
  });

  it("keeps unknown paths unchanged", () => {
    expect(resolveMcpPathAlias("/api/healthz")).toBe("/api/healthz");
  });
});

describe("prepareRequestUrl", () => {
  it("rewrites vercel __path aliases and preserves query params", () => {
    const prepared = prepareRequestUrl("/api?__path=/api/mcp-open&foo=1");

    expect(prepared.requestPath).toBe("/api/mcp");
    expect(prepared.requestUrl).toBe("/api/mcp?foo=1");
    expect(prepared.wasRewritten).toBe(true);
  });

  it("rewrites direct alias paths", () => {
    const prepared = prepareRequestUrl("/api/mcp-noauth?x=9");

    expect(prepared.requestPath).toBe("/api/mcp");
    expect(prepared.requestUrl).toBe("/api/mcp?x=9");
    expect(prepared.wasRewritten).toBe(true);
  });

  it("returns unchanged URL for non-aliased paths", () => {
    const prepared = prepareRequestUrl("/api/mcp?x=1");

    expect(prepared.requestPath).toBe("/api/mcp");
    expect(prepared.requestUrl).toBe("/api/mcp?x=1");
    expect(prepared.wasRewritten).toBe(false);
  });
});

describe("normalizeKnownEnvVars", () => {
  it("trims newline and whitespace from known env vars", () => {
    const env: NodeJS.ProcessEnv = {
      WAUTH_DEMO_ISSUER: " https://wauth-demo.showntell.dev/api\n",
      WAUTH_DEMO_HAPP_BASE_URL: " https://happ.showntell.dev/\n ",
      WAUTH_DEMO_ALLOWED_HOSTS: " localhost, wauth-demo.showntell.dev \n",
      WAUTH_DEMO_BIND_HOST: " 127.0.0.1 \n"
    };

    normalizeKnownEnvVars(env);

    expect(env.WAUTH_DEMO_ISSUER).toBe("https://wauth-demo.showntell.dev/api");
    expect(env.WAUTH_DEMO_HAPP_BASE_URL).toBe("https://happ.showntell.dev/");
    expect(env.WAUTH_DEMO_ALLOWED_HOSTS).toBe("localhost, wauth-demo.showntell.dev");
    expect(env.WAUTH_DEMO_BIND_HOST).toBe("127.0.0.1");
  });

  it("does not overwrite empty-trimmed values", () => {
    const env: NodeJS.ProcessEnv = {
      WAUTH_DEMO_ISSUER: "   "
    };

    normalizeKnownEnvVars(env);

    expect(env.WAUTH_DEMO_ISSUER).toBe("   ");
  });
});
