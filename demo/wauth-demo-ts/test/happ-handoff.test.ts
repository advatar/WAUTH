import { describe, expect, it } from "vitest";

import { buildHappApprovalHandoffUrl } from "../src/mcp-server.js";

describe("buildHappApprovalHandoffUrl", () => {
  it("builds HAPP handoff URL with callback and approval context", () => {
    const url = buildHappApprovalHandoffUrl({
      happBaseUrl: "https://happ.showntell.dev",
      issuerBaseUrl: "https://wauth-demo.showntell.dev",
      approvalId: "approve_123",
      requestPath: "/api/mcp",
      workflowId: "wf_abc"
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://happ.showntell.dev");
    expect(parsed.searchParams.get("approval_id")).toBe("approve_123");
    expect(parsed.searchParams.get("workflow_id")).toBe("wf_abc");
    expect(parsed.searchParams.get("mode")).toBe("verify");
    expect(parsed.searchParams.get("resource")).toBe("approve_123");

    const callback = new URL(parsed.searchParams.get("return_url")!);
    expect(callback.toString()).toBe(
      "https://wauth-demo.showntell.dev/api/iproov/approve/complete?approval_id=approve_123"
    );
  });

  it("does not duplicate /api when issuer already includes /api", () => {
    const url = buildHappApprovalHandoffUrl({
      happBaseUrl: "https://happ.showntell.dev",
      issuerBaseUrl: "https://wauth-demo.showntell.dev/api",
      approvalId: "approve_456",
      requestPath: "/api/mcp"
    });

    const parsed = new URL(url);
    const callback = new URL(parsed.searchParams.get("return_url")!);
    expect(callback.toString()).toBe(
      "https://wauth-demo.showntell.dev/api/iproov/approve/complete?approval_id=approve_456"
    );
  });
});
