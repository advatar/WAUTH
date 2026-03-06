import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpExpressApp } from "../src/mcp-server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

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
    expect(html).toContain("Mock relying parties with readable front doors.");
    expect(html).toContain("/api/bank");
    expect(html).toContain("/api/hr");
    expect(html).toContain("/api/tax-office");
  });

  it("renders readable landing pages for bank, HR, and tax office", async () => {
    const baseUrl = await listen();

    const bankHtml = await fetch(`${baseUrl}/api/bank`).then((response) => response.text());
    expect(bankHtml).toContain("NorthRiver Bank Statement Vault");
    expect(bankHtml).toContain("https://bank.demo.local/api/statement");

    const hrHtml = await fetch(`${baseUrl}/api/hr`).then((response) => response.text());
    expect(hrHtml).toContain("Juniper HR Income Records");
    expect(hrHtml).toContain("https://employer.demo.local/api/income");

    const taxHtml = await fetch(`${baseUrl}/api/tax-office`).then((response) => response.text());
    expect(taxHtml).toContain("Civic Revenue Filing Gateway");
    expect(taxHtml).toContain("https://irs.demo.local/api/submit");
  });
});
