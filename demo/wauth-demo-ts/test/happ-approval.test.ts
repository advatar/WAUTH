import { describe, expect, it } from "vitest";

import {
  buildWorkflowHappApprovalRequest,
  buildWauthHappApprovalRequest,
  mapMinPohpToHappLevel
} from "../src/happ-approval.js";

describe("mapMinPohpToHappLevel", () => {
  it("maps numeric min_pohp values into HAPP assurance levels", () => {
    expect(mapMinPohpToHappLevel(undefined)).toBe("AAIF-PoHP-1");
    expect(mapMinPohpToHappLevel(1)).toBe("AAIF-PoHP-1");
    expect(mapMinPohpToHappLevel(2)).toBe("AAIF-PoHP-2");
    expect(mapMinPohpToHappLevel(3)).toBe("AAIF-PoHP-3");
  });
});

describe("buildWorkflowHappApprovalRequest", () => {
  it("builds a step-up request for tax workflow checkpoints", () => {
    const request = buildWorkflowHappApprovalRequest({
      issuerAudience: "https://wauth-demo.showntell.dev",
      workflowId: "wf_123",
      approvalId: "approve_123",
      stage: "final_submit",
      message: "Final approval needed."
    });

    expect(request.requestId).toBe("happ-approve_123");
    expect((request.actionIntent.display as { title?: string }).title).toBe("Approve final tax submission");
    expect((request.requirements.pohp as { minLevel?: string }).minLevel).toBe("AAIF-PoHP-2");
  });
});

describe("buildWauthHappApprovalRequest", () => {
  it("maps WAUTH assurance and action binding into a HAPP request", () => {
    const actionInstance = {
      profile: "aaif.wauth.action.bank.read_statement/v0.1",
      action: "read_statement",
      resource: "bank:acct:123",
      month: "2026-01"
    };
    const request = buildWauthHappApprovalRequest({
      issuerAudience: "https://wauth-demo.showntell.dev",
      approvalId: "approve_wauth_1",
      requestId: "req-bank-1",
      actionInstance,
      wauthRequired: {
        authorization_details: [
          {
            action_profile: "aaif.wauth.action.bank.read_statement/v0.1",
            actions: ["execute"],
            locations: ["https://bank.demo.local/api/statement"],
            assurance: {
              min_pohp: 2,
              accepted_pp_profiles: ["happ:eu-wallet", "happ:iproov"],
              freshness_seconds: 180
            }
          }
        ]
      }
    });

    const action = request.actionIntent.action as { parameters?: { locations?: string[]; actions?: string[] } };
    expect(request.requestId).toBe("happ-approve_wauth_1");
    expect(action.parameters?.locations).toEqual(["https://bank.demo.local/api/statement"]);
    expect(action.parameters?.actions).toEqual(["execute"]);
    expect((request.requirements.pohp as { minLevel?: string; maxCredentialAgeSeconds?: number }).minLevel).toBe(
      "AAIF-PoHP-2"
    );
    expect((request.requirements.pohp as { maxCredentialAgeSeconds?: number }).maxCredentialAgeSeconds).toBe(180);
  });
});
