import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TaxWorkflowService } from "../src/workflow.js";

describe("TaxWorkflowService", () => {
  it("advances workflow through two approval gates and completes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wauth-demo-workflow-"));
    const dataFile = join(dir, "state.json");
    const service = new TaxWorkflowService({
      dataFilePath: dataFile,
      approvalBaseUrl: "https://wauth-demo.showntell.dev/iproov/approve"
    });

    const first = await service.runTaxFiling("session-1");
    expect(first.pendingApproval?.stage).toBe("read_evidence");
    expect(first.state.status).toBe("pending_approval");
    expect(first.pendingApproval?.approvalUrl).toContain("https://wauth-demo.showntell.dev/iproov/approve");

    const second = await service.approveAndAdvanceByApprovalId(first.pendingApproval!.approvalId);
    expect(second.pendingApproval?.stage).toBe("final_submit");

    const third = await service.approveAndAdvanceByApprovalId(second.pendingApproval!.approvalId);

    expect(third.state.status).toBe("complete");
    expect(third.result?.ok).toBe(true);
    expect(third.result?.receipts.length).toBe(3);
  });

  it("persists workflow state to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wauth-demo-workflow-"));
    const dataFile = join(dir, "state.json");

    const service1 = new TaxWorkflowService(dataFile);
    const run = await service1.runTaxFiling("session-2");
    const workflowId = run.workflowId;

    const service2 = new TaxWorkflowService(dataFile);
    const restored = await service2.status("session-2", workflowId);

    expect(restored?.workflowId).toBe(workflowId);
    expect(restored?.pendingApproval?.stage).toBe("read_evidence");
  });
});
