import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runHttpTaxDemoScenario } from "../src/http-tax-scenario.js";
import { buildMcpExpressApp, type DemoRuntime } from "../src/mcp-server.js";
import { TaxWorkflowService } from "../src/workflow.js";
import { WauthRequestService } from "../src/wauth-state.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function listen(app: ReturnType<typeof buildMcpExpressApp>): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function createRuntime(): Promise<DemoRuntime> {
  const dir = await mkdtemp(join(tmpdir(), "wauth-demo-http-scenario-"));
  return {
    workflowService: new TaxWorkflowService({
      dataFilePath: join(dir, "workflow.json"),
      approvalBaseUrl: "https://wauth-demo.showntell.dev/api/iproov/approve"
    }),
    wauthService: new WauthRequestService({
      issuer: "https://wauth-demo.showntell.dev/api",
      dataFilePath: join(dir, "wauth.json"),
      approvalBaseUrl: "https://wauth-demo.showntell.dev/api/iproov/approve"
    }),
    happ: {
      mode: "handoff",
      baseUrl: "https://happ.showntell.dev"
    }
  };
}

describe("HTTP tax scenario", () => {
  it("runs the tax flow against actual protected-resource routes", async () => {
    const runtime = await createRuntime();
    const app = buildMcpExpressApp({
      runtime,
      issuerBaseUrl: "https://wauth-demo.showntell.dev/api"
    });
    const baseUrl = await listen(app);

    const result = await runHttpTaxDemoScenario({
      issuerBaseUrl: baseUrl,
      workflowId: "wf-http-1",
      wauthService: runtime.wauthService
    });

    expect(result.ok).toBe(true);
    expect(result.receipts).toHaveLength(3);
    expect(result.receipts.map((receipt) => receipt.rp).sort()).toEqual([
      "BankRP",
      "EmployerRP",
      "IRSRP"
    ]);
    expect(result.timeline.filter((event) => event.type === "rp.accepted")).toHaveLength(3);
    expect(result.timeline.filter((event) => event.type === "wallet.capability_requested")).toHaveLength(3);
  });
});
