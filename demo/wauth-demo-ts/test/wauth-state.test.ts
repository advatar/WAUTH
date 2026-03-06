import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { JSONWebKeySet } from "jose";

import { computeActionHash, verifyCapabilityJwtWithJwks } from "../src/sdk.js";
import { WauthRequestService } from "../src/wauth-state.js";

describe("WauthRequestService", () => {
  it("issues JWT capability after approval and serves it via get", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wauth-demo-request-"));
    const dataFile = join(dir, "wauth-state.json");
    const service = new WauthRequestService({
      issuer: "https://wauth-demo.showntell.dev",
      dataFilePath: dataFile,
      approvalBaseUrl: "https://wauth-demo.showntell.dev/iproov/approve"
    });

    const actionInstance = {
      profile: "aaif.wauth.action.bank.read_statement/v0.1",
      action: "read_statement",
      resource: "bank:acct:123",
      month: "2026-01"
    };

    const wauthRequired = {
      transaction_id: "txn-bank-1",
      authorization_details: [
        {
          type: "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1",
          actions: ["execute"],
          locations: ["https://bank.demo.local/api/statement"]
        }
      ]
    };

    const first = await service.request("session-1", {
      requestId: "req-bank-1",
      wauthRequired,
      actionInstance,
      agentIdentity: {
        cnf_jkt: "demo-jkt-123"
      }
    });

    expect(first.pendingApproval?.approvalId).toBeDefined();
    expect(first.pendingApproval?.approvalUrl).toContain("https://wauth-demo.showntell.dev/iproov/approve");

    await service.approveByApprovalId(first.pendingApproval!.approvalId);

    const second = await service.request("session-1", {
      requestId: "req-bank-1",
      wauthRequired,
      actionInstance
    });

    const ref = second.envelope?.artifacts?.[0]?.ref;
    expect(typeof ref).toBe("string");

    const artifact = await service.getArtifact(ref!);
    const token = (artifact.inline as { token?: string })?.token;
    expect(typeof token).toBe("string");

    const jwks = await service.jwks();
    const verification = await verifyCapabilityJwtWithJwks({
      token: token!,
      jwks: jwks as unknown as JSONWebKeySet,
      expectedIssuer: "https://wauth-demo.showntell.dev",
      expectedAudience: "https://bank.demo.local/api/statement",
      expectedActionHash: computeActionHash(actionInstance)
    });

    expect(verification.ok).toBe(true);
    expect(verification.errors).toHaveLength(0);
  });

  it("persists pending approvals to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wauth-demo-request-"));
    const dataFile = join(dir, "wauth-state.json");

    const service1 = new WauthRequestService({
      issuer: "https://wauth-demo.showntell.dev",
      dataFilePath: dataFile,
      approvalBaseUrl: "https://wauth-demo.showntell.dev/iproov/approve"
    });

    const run = await service1.request("session-2", {
      requestId: "req-employer-1",
      wauthRequired: {
        transaction_id: "txn-employer-1",
        authorization_details: [
          {
            actions: ["execute"],
            locations: ["https://employer.demo.local/api/income"]
          }
        ]
      }
    });
    await service1.attachHappSession(run.pendingApproval!.approvalId, {
      mode: "local-ref",
      requestId: "happ-req-2",
      sessionId: "sess-2",
      sessionUrl: "http://127.0.0.1:8787/session/sess-2",
      sessionApiUrl: "http://127.0.0.1:8787/api/session/sess-2",
      actionIntent: {
        audience: { id: "https://wauth-demo.showntell.dev" }
      },
      requirements: {
        pohp: { minLevel: "AAIF-PoHP-2" }
      },
      status: "pending",
      createdAt: "2026-03-06T12:00:00.000Z",
      updatedAt: "2026-03-06T12:00:00.000Z"
    });

    const service2 = new WauthRequestService({
      issuer: "https://wauth-demo.showntell.dev",
      dataFilePath: dataFile,
      approvalBaseUrl: "https://wauth-demo.showntell.dev/iproov/approve"
    });

    const pending = await service2.findPendingApprovalById(run.pendingApproval!.approvalId);
    expect(pending?.requestId).toBe("req-employer-1");
    expect(pending?.happ?.sessionId).toBe("sess-2");
  });
});
