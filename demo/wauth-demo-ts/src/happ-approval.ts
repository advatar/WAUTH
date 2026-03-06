import { createHash } from "node:crypto";

import type { JsonValue } from "./sdk.js";
import type { HappApprovalRequest, HappConsentCredentialEnvelope } from "./happ-local-ref.js";
import type { ApprovalStage, PendingApproval as WorkflowPendingApproval } from "./workflow.js";

export interface WauthPendingApprovalContext {
  approvalId: string;
  requestId: string;
  message: string;
  createdAt: string;
  wauthRequired: Record<string, JsonValue>;
  actionInstance?: JsonValue;
}

export interface HappApprovalEvidence {
  provider: "happ";
  requestId: string;
  sessionUrl?: string;
  credentialFormat: string;
  providerIssuer?: string;
  audience?: string;
  assuranceLevel?: string;
  verifiedAt?: string;
  intentHash?: string;
  presentationHash?: string;
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function asArray(value: JsonValue | undefined): JsonValue[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function firstAuthorizationDetail(wauthRequired: Record<string, JsonValue>): Record<string, JsonValue> | undefined {
  const authorizationDetails = asArray(wauthRequired.authorization_details);
  if (!authorizationDetails || authorizationDetails.length === 0) {
    return undefined;
  }
  return asRecord(authorizationDetails[0]);
}

function deterministicUuid(seed: string): string {
  const bytes = createHash("sha1").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function isoPlusSeconds(iso: string, seconds: number): string {
  const at = new Date(iso).getTime();
  return new Date(at + seconds * 1000).toISOString();
}

function pohpLevelFromNumber(minPohp: number): string {
  if (minPohp >= 4) {
    return "AAIF-PoHP-4";
  }
  if (minPohp >= 3) {
    return "AAIF-PoHP-3";
  }
  if (minPohp >= 2) {
    return "AAIF-PoHP-2";
  }
  return "AAIF-PoHP-1";
}

export function mapMinPohpToHappLevel(minPohp: number | undefined): string {
  return pohpLevelFromNumber(typeof minPohp === "number" ? minPohp : 1);
}

function stageTitle(stage: ApprovalStage): string {
  return stage === "read_evidence"
    ? "Approve tax evidence collection"
    : "Approve final tax submission";
}

function stageSummary(stage: ApprovalStage): string {
  return stage === "read_evidence"
    ? "Allow WAUTH to collect the bank and employer evidence needed to prepare your tax return."
    : "Allow WAUTH to use the prepared evidence bundle and submit your tax return.";
}

function stageRiskNotice(stage: ApprovalStage): string {
  return stage === "read_evidence"
    ? "Read-only access is being requested for tax evidence collection."
    : "This approval authorizes the final submission step to the tax office.";
}

export function buildWorkflowHappRequest(options: {
  issuerBaseUrl: string;
  workflowId: string;
  approval: WorkflowPendingApproval;
}): HappApprovalRequest {
  const minPohp = options.approval.stage === "final_submit" ? 2 : 1;
  return {
    requestId: `happ-${options.approval.approvalId}`,
    actionIntent: {
      version: "0.3.4",
      intentId: deterministicUuid(`workflow:${options.approval.approvalId}`),
      issuedAt: options.approval.createdAt,
      profile: "aaif.happ.profile.wauth.tax-approval/v0.1",
      audience: {
        id: options.issuerBaseUrl,
        name: "WAUTH Demo WAS"
      },
      agent: {
        id: "did:example:agent:wauth-demo-tax-assistant",
        name: "WAUTH Demo Tax Assistant",
        software: {
          name: "wauth-demo-ts",
          version: "0.1.0"
        }
      },
      action: {
        type: options.approval.stage === "read_evidence"
          ? "wauth.tax.read_evidence"
          : "wauth.tax.final_submit",
        parameters: {
          approvalId: options.approval.approvalId,
          workflowId: options.workflowId,
          stage: options.approval.stage
        }
      },
      constraints: {
        expiresAt: isoPlusSeconds(options.approval.createdAt, 900),
        oneTime: true,
        maxUses: 1,
        envelope: {
          approvalId: options.approval.approvalId,
          workflowId: options.workflowId,
          stage: options.approval.stage
        }
      },
      display: {
        language: "en",
        title: stageTitle(options.approval.stage),
        summary: stageSummary(options.approval.stage),
        riskNotice: stageRiskNotice(options.approval.stage)
      },
      policy: {
        requiredPoHPLevel: pohpLevelFromNumber(minPohp),
        jurisdiction: "US",
        purpose: "tax_filing"
      }
    } as Record<string, JsonValue>,
    requirements: {
      pohp: {
        minLevel: pohpLevelFromNumber(minPohp),
        maxCredentialAgeSeconds: 300
      }
    }
  };
}

export function buildWorkflowHappApprovalRequest(options: {
  issuerAudience: string;
  workflowId: string;
  approvalId: string;
  stage: ApprovalStage;
  message: string;
}): HappApprovalRequest {
  return buildWorkflowHappRequest({
    issuerBaseUrl: options.issuerAudience,
    workflowId: options.workflowId,
    approval: {
      approvalId: options.approvalId,
      stage: options.stage,
      message: options.message,
      approvalUrl: "",
      createdAt: new Date().toISOString()
    }
  });
}

export function buildWauthHappRequest(options: {
  issuerBaseUrl: string;
  pending: WauthPendingApprovalContext;
}): HappApprovalRequest {
  const firstDetail = firstAuthorizationDetail(options.pending.wauthRequired);
  const assurance = asRecord(firstDetail?.assurance);
  const minPohp = typeof assurance?.min_pohp === "number"
    ? assurance.min_pohp
    : 1;
  const actions = asArray(firstDetail?.actions)
    ?.filter((value): value is string => typeof value === "string");
  const locations = asArray(firstDetail?.locations)
    ?.filter((value): value is string => typeof value === "string");
  const envelope = asRecord(firstDetail?.envelope);

  return {
    requestId: `happ-${options.pending.approvalId}`,
    actionIntent: {
      version: "0.3.4",
      intentId: deterministicUuid(`wauth:${options.pending.approvalId}`),
      issuedAt: options.pending.createdAt,
      profile: "aaif.happ.profile.wauth.capability-issuance/v0.1",
      audience: {
        id: options.issuerBaseUrl,
        name: "WAUTH Demo WAS"
      },
      agent: {
        id: "did:example:agent:wauth-demo-wallet-service",
        name: "WAUTH Demo Wallet Service",
        software: {
          name: "wauth-demo-ts",
          version: "0.1.0"
        }
      },
      action: {
        type: "wauth.issue_capability",
        parameters: {
          approvalId: options.pending.approvalId,
          requestId: options.pending.requestId,
          transactionId: options.pending.wauthRequired.transaction_id,
          actions: actions ?? [],
          locations: locations ?? [],
          actionProfile: firstDetail?.action_profile,
          envelope: envelope ?? {},
          actionInstance: options.pending.actionInstance ?? null
        }
      },
      constraints: {
        expiresAt: isoPlusSeconds(options.pending.createdAt, 900),
        oneTime: true,
        maxUses: 1,
        envelope: {
          approvalId: options.pending.approvalId,
          requestId: options.pending.requestId
        }
      },
      display: {
        language: "en",
        title: "Approve WAUTH capability issuance",
        summary: options.pending.message,
        riskNotice: locations && locations.length > 0
          ? `The resulting capability will be scoped to ${locations[0]}.`
          : "The resulting capability will be scoped to the requesting relying party."
      },
      policy: {
        requiredPoHPLevel: pohpLevelFromNumber(minPohp),
        purpose: "wauth_capability_issuance"
      }
    } as Record<string, JsonValue>,
    requirements: {
      pohp: {
        minLevel: pohpLevelFromNumber(minPohp),
        maxCredentialAgeSeconds: typeof assurance?.freshness_seconds === "number"
          ? assurance.freshness_seconds
          : 300
      }
    }
  };
}

export function buildWauthHappApprovalRequest(options: {
  issuerAudience: string;
  approvalId: string;
  requestId: string;
  wauthRequired: Record<string, JsonValue>;
  actionInstance?: JsonValue;
}): HappApprovalRequest {
  return buildWauthHappRequest({
    issuerBaseUrl: options.issuerAudience,
    pending: {
      approvalId: options.approvalId,
      requestId: options.requestId,
      message: "Verify your presence to approve WAUTH capability issuance.",
      createdAt: new Date().toISOString(),
      wauthRequired: options.wauthRequired,
      actionInstance: options.actionInstance
    }
  });
}

export function summarizeHappEvidence(
  requestId: string,
  credential: HappConsentCredentialEnvelope,
  sessionUrl?: string
): HappApprovalEvidence {
  return {
    provider: "happ",
    requestId,
    sessionUrl,
    credentialFormat: credential.format,
    providerIssuer: typeof credential.claims.issuer === "string"
      ? credential.claims.issuer
      : undefined,
    audience: typeof credential.claims.aud === "string"
      ? credential.claims.aud
      : undefined,
    assuranceLevel: asRecord(credential.claims.assurance)?.level as string | undefined,
    verifiedAt: asRecord(credential.claims.assurance)?.verifiedAt as string | undefined,
    intentHash: typeof credential.claims.intent_hash === "string"
      ? credential.claims.intent_hash
      : undefined,
    presentationHash: typeof credential.claims.presentation_hash === "string"
      ? credential.claims.presentation_hash
      : undefined
  };
}
