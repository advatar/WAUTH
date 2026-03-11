import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpExpressApp } from "../src/mcp-server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === "string") {
    process.env[key] = value;
    return;
  }
  delete process.env[key];
}

async function listen(): Promise<string> {
  const server = createServer(buildMcpExpressApp());
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("mock RP landing pages", () => {
  it("renders the RP directory on /api", async () => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}/api`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Choose a secure service portal.");
    expect(html).toContain("/api/bank");
    expect(html).toContain("/api/hr");
    expect(html).toContain("/api/tax-office");
  });

  it("renders readable landing pages for bank, HR, and tax office", async () => {
    const baseUrl = await listen();

    const bankHtml = await fetch(`${baseUrl}/api/bank`).then((response) => response.text());
    expect(bankHtml).toContain("NorthRiver Bank Statement Vault");
    expect(bankHtml).toContain("Additional verification required");
    expect(bankHtml).toContain("Jan 2026 checking statement");
    expect(bankHtml).toContain(`${baseUrl}/api/bank/api/statement`);

    const hrHtml = await fetch(`${baseUrl}/api/hr`).then((response) => response.text());
    expect(hrHtml).toContain("Juniper HR Income Records");
    expect(hrHtml).toContain("2025 annual payroll summary");
    expect(hrHtml).toContain(`${baseUrl}/api/hr/api/income`);

    const taxHtml = await fetch(`${baseUrl}/api/tax-office`).then((response) => response.text());
    expect(taxHtml).toContain("Civic Revenue Filing Gateway");
    expect(taxHtml).toContain("Prepared 2025 return bundle");
    expect(taxHtml).toContain("Security and access details");
    expect(taxHtml).toContain(`${baseUrl}/api/tax-office/api/submit`);
  });

  it("serves protected resource metadata and requirements templates for mock RPs", async () => {
    const baseUrl = await listen();

    const bankPrmResponse = await fetch(`${baseUrl}/api/bank/.well-known/oauth-protected-resource`);
    expect(bankPrmResponse.status).toBe(200);
    const bankPrm = await bankPrmResponse.json();
    expect(bankPrm.resource).toBe(`${baseUrl}/api/bank/api/statement`);
    expect(bankPrm.wauth.supported).toBe(true);
    expect(bankPrm.wauth.profiles_supported).toContain("aaif.wauth.profile.rp-protected-resource-metadata/v0.1");
    expect(bankPrm.wauth.profiles_supported).toContain("aaif.wauth.profile.rp-requirements-signaling/v0.1");
    expect(bankPrm.wauth.requirements_uri).toBe(`${baseUrl}/api/bank/.well-known/wauth-requirements`);

    const bankRequirementsResponse = await fetch(bankPrm.wauth.requirements_uri);
    expect(bankRequirementsResponse.status).toBe(200);
    const bankRequirements = await bankRequirementsResponse.json();
    expect(bankRequirements.max_capability_ttl_seconds).toBe(900);
    expect(bankRequirements.authorization_details[0].action_profile).toBe("aaif.wauth.action.bank.read_statement/v0.1");
    expect(bankRequirements.authorization_details[0].locations).toEqual([`${baseUrl}/api/bank/api/statement`]);
    expect(bankRequirements.authorization_details[0].action_hash).toBeUndefined();

    const taxPrmResponse = await fetch(`${baseUrl}/api/irs/.well-known/oauth-protected-resource`);
    expect(taxPrmResponse.status).toBe(200);
    const taxPrm = await taxPrmResponse.json();
    expect(taxPrm.resource).toBe(`${baseUrl}/api/irs/api/submit`);

    const taxRequirements = await fetch(taxPrm.wauth.requirements_uri).then((response) => response.json());
    expect(taxRequirements.max_capability_ttl_seconds).toBe(300);
    expect(taxRequirements.authorization_details[0].assurance.min_pohp).toBe(2);
    expect(taxRequirements.authorization_details[0].action_profile).toBe("aaif.wauth.action.irs.submit_return/v0.1");
  });

  it("rejects requests with an invalid host header", async () => {
    const baseUrl = await listen();
    const url = new URL(`${baseUrl}/healthz`);

    const result = await new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
      const req = request({
        host: url.hostname,
        port: Number(url.port),
        path: url.pathname,
        method: "GET",
        headers: {
          host: "evil.example"
        }
      }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({
          statusCode: res.statusCode,
          body
        }));
      });
      req.on("error", reject);
      req.end();
    });

    expect(result.statusCode).toBe(403);
    expect(result.body).toContain("Invalid Host");
  });

  it("accepts the Vercel production alias host when provided by runtime env", async () => {
    const previousProjectProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "wauth-demo-ts.vercel.app";

    try {
      const baseUrl = await listen();
      const url = new URL(`${baseUrl}/healthz`);

      const result = await new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
        const req = request({
          host: url.hostname,
          port: Number(url.port),
          path: url.pathname,
          method: "GET",
          headers: {
            host: "wauth-demo-ts.vercel.app"
          }
        }, (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => resolve({
            statusCode: res.statusCode,
            body
          }));
        });
        req.on("error", reject);
        req.end();
      });

      expect(result.statusCode).toBe(200);
      expect(result.body).toContain("\"ok\":true");
    } finally {
      restoreEnv("VERCEL_PROJECT_PRODUCTION_URL", previousProjectProductionUrl);
    }
  });
});
