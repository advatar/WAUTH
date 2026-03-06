import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpExpressApp, type DemoRuntime } from "../src/mcp-server.js";
import { TaxWorkflowService } from "../src/workflow.js";
import { WauthRequestService } from "../src/wauth-state.js";
import type {
  HappApprovalRequest,
  HappPendingSession,
  HappRequestResult,
  HappSessionSnapshot
} from "../src/happ-local-ref.js";

class FakePendingHappClient {
  private request?: HappApprovalRequest;

  async requestApproval(input: HappApprovalRequest): Promise<HappRequestResult> {
    this.request = input;
    const createdAt = "2026-03-06T12:00:00.000Z";
    return {
      status: "pending",
      session: {
        mode: "local-ref",
        requestId: input.requestId,
        sessionId: "sess-demo-123",
        sessionUrl: "http://127.0.0.1:8787/session/sess-demo-123",
        sessionApiUrl: "http://127.0.0.1:8787/api/session/sess-demo-123",
        actionIntent: input.actionIntent,
        requirements: input.requirements,
        status: "pending",
        createdAt,
        updatedAt: createdAt
      }
    };
  }

  async getSessionSnapshot(_sessionId: string): Promise<HappSessionSnapshot> {
    return {
      status: "pending"
    };
  }

  lastSession(): HappPendingSession | undefined {
    if (!this.request) {
      return undefined;
    }
    return {
      mode: "local-ref",
      requestId: this.request.requestId,
      sessionId: "sess-demo-123",
      sessionUrl: "http://127.0.0.1:8787/session/sess-demo-123",
      sessionApiUrl: "http://127.0.0.1:8787/api/session/sess-demo-123",
      actionIntent: this.request.actionIntent,
      requirements: this.request.requirements,
      status: "pending",
      createdAt: "2026-03-06T12:00:00.000Z",
      updatedAt: "2026-03-06T12:00:00.000Z"
    };
  }
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function createRuntime(fakeHappClient: FakePendingHappClient): Promise<DemoRuntime> {
  const dir = await mkdtemp(join(tmpdir(), "wauth-demo-approval-routes-"));
  const workflowService = new TaxWorkflowService({
    dataFilePath: join(dir, "workflow.json"),
    approvalBaseUrl: "https://wauth-demo.showntell.dev/api/iproov/approve"
  });
  const wauthService = new WauthRequestService({
    issuer: "https://wauth-demo.showntell.dev/api",
    dataFilePath: join(dir, "wauth.json"),
    approvalBaseUrl: "https://wauth-demo.showntell.dev/api/iproov/approve"
  });

  return {
    workflowService,
    wauthService,
    happ: {
      mode: "local-ref",
      client: fakeHappClient
    }
  };
}

async function listen(app: ReturnType<typeof buildMcpExpressApp>): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("approval routes", () => {
  it("renders a local HAPP landing page and pending status for workflow approvals", async () => {
    const fakeHappClient = new FakePendingHappClient();
    const runtime = await createRuntime(fakeHappClient);
    const first = await runtime.workflowService.runTaxFiling("session-1");
    const approvalId = first.pendingApproval!.approvalId;

    const app = buildMcpExpressApp({
      runtime,
      issuerBaseUrl: "https://wauth-demo.showntell.dev/api"
    });
    const baseUrl = await listen(app);

    const landingResponse = await fetch(`${baseUrl}/api/iproov/approve?approval_id=${encodeURIComponent(approvalId)}`);
    expect(landingResponse.status).toBe(200);
    const landingHtml = await landingResponse.text();
    expect(landingHtml).toContain("Open HAPP Approval");
    expect(landingHtml).toContain("http://127.0.0.1:8787/session/sess-demo-123");
    expect(landingHtml).toContain("Waiting for HAPP approval");

    const statusResponse = await fetch(`${baseUrl}/api/iproov/approve/status?approval_id=${encodeURIComponent(approvalId)}`);
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      status: "pending",
      sessionUrl: "http://127.0.0.1:8787/session/sess-demo-123"
    });

    const completeResponse = await fetch(`${baseUrl}/api/iproov/approve/complete?approval_id=${encodeURIComponent(approvalId)}`);
    expect(completeResponse.status).toBe(409);
    const completeHtml = await completeResponse.text();
    expect(completeHtml).toContain("Approval Still Pending");
  });

  it("resolves WAUTH approvals through the same local HAPP flow", async () => {
    const fakeHappClient = new FakePendingHappClient();
    const runtime = await createRuntime(fakeHappClient);
    const request = await runtime.wauthService.request("session-2", {
      requestId: "req-bank-1",
      wauthRequired: {
        authorization_details: [
          {
            actions: ["execute"],
            locations: ["https://bank.demo.local/api/statement"],
            assurance: {
              min_pohp: 2,
              freshness_seconds: 180
            }
          }
        ]
      }
    });
    const approvalId = request.pendingApproval!.approvalId;

    const app = buildMcpExpressApp({
      runtime,
      issuerBaseUrl: "https://wauth-demo.showntell.dev/api"
    });
    const baseUrl = await listen(app);

    const landingResponse = await fetch(`${baseUrl}/api/iproov/approve?approval_id=${encodeURIComponent(approvalId)}`);
    expect(landingResponse.status).toBe(200);
    const landingHtml = await landingResponse.text();
    expect(landingHtml).toContain("Request: req-bank-1");
    expect(landingHtml).toContain("Open HAPP Approval");

    const statusResponse = await fetch(`${baseUrl}/api/iproov/approve/status?approval_id=${encodeURIComponent(approvalId)}`);
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      status: "pending",
      sessionUrl: "http://127.0.0.1:8787/session/sess-demo-123"
    });
  });
});
