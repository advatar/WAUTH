import { randomUUID } from "node:crypto";

import * as z from "zod/v4";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { ErrorCode, McpError, isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { buildWorkflowHappApprovalRequest, buildWauthHappApprovalRequest } from "./happ-approval.js";
import {
  HappLocalRefClient,
  localHappRefAvailable,
  verifyHappEnvelope,
  type HappApprovalRequest,
  type HappRequestResult,
  type HappPendingSession,
  type HappSessionSnapshot,
  type HappSessionStatus
} from "./happ-local-ref.js";
import {
  findMockRpPage,
  isMockRpDirectoryPath,
  renderMockRpDirectoryPage,
  renderMockRpLandingPage,
  type MockRpPage
} from "./rp-pages.js";
import { TaxWorkflowService, type PendingApproval as WorkflowPendingApproval } from "./workflow.js";
import { WauthRequestService, type WauthPendingApproval } from "./wauth-state.js";
import type { JsonValue } from "./sdk.js";

const DEFAULT_PORT = 3000;
const DEFAULT_ISSUER = process.env.WAUTH_DEMO_ISSUER ?? "https://wauth-demo.showntell.dev";
const DEFAULT_HAPP_BASE_URL = process.env.WAUTH_DEMO_HAPP_BASE_URL ?? "https://happ.showntell.dev";
const DEFAULT_HAPP_MODE = process.env.WAUTH_DEMO_HAPP_MODE
  ?? (localHappRefAvailable() ? "local-ref" : "handoff");
const MCP_REQUEST_PATH = "/api/mcp";
const WAUTH_ACTION_DETAILS_TYPE = "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1";
const WAUTH_RP_PRM_PROFILE = "aaif.wauth.profile.rp-protected-resource-metadata/v0.1";
const WAUTH_RP_REQSIG_PROFILE = "aaif.wauth.profile.rp-requirements-signaling/v0.1";
const RP_PRM_SUFFIX = "/.well-known/oauth-protected-resource";
const RP_REQUIREMENTS_SUFFIX = "/.well-known/wauth-requirements";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const issuerBase = trimTrailingSlash(DEFAULT_ISSUER);
const approvalBaseUrl = `${issuerBase}/iproov/approve`;
const happBaseUrl = trimTrailingSlash(DEFAULT_HAPP_BASE_URL);

type DemoHappRuntime =
  | {
      mode: "handoff";
      baseUrl: string;
    }
  | {
      mode: "local-ref";
      client: {
        requestApproval(input: HappApprovalRequest): Promise<HappRequestResult>;
        getSessionSnapshot(sessionId: string): Promise<HappSessionSnapshot>;
      };
    };

export interface DemoRuntime {
  workflowService: TaxWorkflowService;
  wauthService: WauthRequestService;
  happ: DemoHappRuntime;
}

let runtimePromise: Promise<DemoRuntime> | undefined;

function createRuntime(): DemoRuntime {
  return {
    workflowService: new TaxWorkflowService({
      dataFilePath: process.env.WAUTH_DEMO_STATE_FILE,
      approvalBaseUrl
    }),
    wauthService: new WauthRequestService({
      issuer: issuerBase,
      dataFilePath: process.env.WAUTH_DEMO_WAUTH_STATE_FILE,
      approvalBaseUrl
    }),
    happ: DEFAULT_HAPP_MODE === "local-ref"
      ? {
          mode: "local-ref",
          client: new HappLocalRefClient()
        }
      : {
          mode: "handoff",
          baseUrl: happBaseUrl
        }
  };
}

async function getRuntime(): Promise<DemoRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.resolve(createRuntime());
  }
  return runtimePromise;
}

function toolText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toRecord(value: unknown): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }
  return undefined;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asStructuredContent(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function completionPathForRequestPath(pathname: string): string {
  return isApiPath(pathname)
    ? "/api/iproov/approve/complete"
    : "/iproov/approve/complete";
}

function approvalPathForRequestPath(pathname: string): string {
  return isApiPath(pathname)
    ? "/api/iproov/approve"
    : "/iproov/approve";
}

function approvalStatusPathForRequestPath(pathname: string): string {
  return isApiPath(pathname)
    ? "/api/iproov/approve/status"
    : "/iproov/approve/status";
}

function buildApprovalCompletionUrl(
  issuer: string,
  approvalId: string,
  requestPath: string
): string {
  const callbackUrl = new URL(completionPathForRequestPath(requestPath), issuer.trim());
  callbackUrl.searchParams.set("approval_id", approvalId);
  return callbackUrl.toString();
}

export function buildApprovalLandingUrl(options: {
  issuerBaseUrl: string;
  approvalId: string;
  requestPath: string;
}): string {
  const approvalUrl = new URL(approvalPathForRequestPath(options.requestPath), options.issuerBaseUrl.trim());
  approvalUrl.searchParams.set("approval_id", options.approvalId);
  return approvalUrl.toString();
}

function buildApprovalStatusUrl(options: {
  issuerBaseUrl: string;
  approvalId: string;
  requestPath: string;
}): string {
  const statusUrl = new URL(approvalStatusPathForRequestPath(options.requestPath), options.issuerBaseUrl.trim());
  statusUrl.searchParams.set("approval_id", options.approvalId);
  return statusUrl.toString();
}

function stripKnownSuffix(pathname: string, suffix: string): string | undefined {
  return pathname.endsWith(suffix) ? pathname.slice(0, -suffix.length) || "/" : undefined;
}

function externalOriginForRequest(req: Request, fallbackBaseUrl: string): string {
  const forwardedProto = req.get("x-forwarded-proto");
  const forwardedHost = req.get("x-forwarded-host");
  const host = forwardedHost ?? req.get("host");
  if (!host) {
    return trimTrailingSlash(fallbackBaseUrl);
  }
  const proto = forwardedProto
    ? forwardedProto.split(",")[0]!.trim()
    : req.protocol;
  return `${proto}://${host}`;
}

function absoluteUrl(origin: string, pathname: string): string {
  return new URL(pathname, `${trimTrailingSlash(origin)}/`).toString();
}

function scopesForMockRp(page: MockRpPage): string[] {
  switch (page.slug) {
    case "bank":
      return ["statement:read"];
    case "hr":
      return ["income:read"];
    case "tax-office":
      return ["filing:submit"];
  }
}

function actionsForMockRp(page: MockRpPage): string[] {
  switch (page.slug) {
    case "bank":
      return ["read_statement"];
    case "hr":
      return ["read_income"];
    case "tax-office":
      return ["submit_return"];
  }
}

function minPoHpForMockRp(page: MockRpPage): number {
  return page.slug === "tax-office" ? 2 : 1;
}

function buildMockRpProtectedResourceMetadata(options: {
  page: MockRpPage;
  resourcePath: string;
  origin: string;
  authorizationServer: string;
}): Record<string, JsonValue> {
  const requirementsUri = absoluteUrl(options.origin, `${options.resourcePath}${RP_REQUIREMENTS_SUFFIX}`);
  return {
    resource: absoluteUrl(options.origin, options.resourcePath),
    authorization_servers: [options.authorizationServer],
    bearer_methods_supported: ["header"],
    scopes_supported: scopesForMockRp(options.page),
    wauth: {
      supported: true,
      profiles_supported: [WAUTH_RP_PRM_PROFILE, WAUTH_RP_REQSIG_PROFILE],
      capability_formats_supported: ["jwt"],
      authorization_details_types_supported: [WAUTH_ACTION_DETAILS_TYPE],
      sender_constraint_methods_supported: ["dpop"],
      requirement_signaling_methods_supported: ["wauth_required"],
      requirements_uri: requirementsUri,
      documentation_uri: absoluteUrl(options.origin, options.resourcePath)
    }
  };
}

function buildMockRpRequirements(page: MockRpPage): Record<string, JsonValue> {
  return {
    authorization_details: [
      {
        type: WAUTH_ACTION_DETAILS_TYPE,
        actions: actionsForMockRp(page),
        locations: [page.audience],
        action_profile: page.actionProfile,
        hash_alg: "S256",
        assurance: {
          min_pohp: minPoHpForMockRp(page)
        },
        envelope: {
          max_uses: 1
        }
      }
    ],
    satisfy: "all",
    max_capability_ttl_seconds: page.slug === "tax-office" ? 300 : 900
  };
}

export function buildHappApprovalHandoffUrl(options: {
  happBaseUrl: string;
  issuerBaseUrl: string;
  approvalId: string;
  requestPath: string;
  workflowId?: string;
  requestId?: string;
}): string {
  const handoffUrl = new URL(options.happBaseUrl);
  handoffUrl.searchParams.set("approval_id", options.approvalId);
  handoffUrl.searchParams.set("mode", "verify");
  handoffUrl.searchParams.set("resource", options.approvalId);
  handoffUrl.searchParams.set("auto_start", "1");
  handoffUrl.searchParams.set(
    "return_url",
    buildApprovalCompletionUrl(options.issuerBaseUrl, options.approvalId, options.requestPath)
  );
  if (options.workflowId) {
    handoffUrl.searchParams.set("workflow_id", options.workflowId);
  }
  if (options.requestId) {
    handoffUrl.searchParams.set("request_id", options.requestId);
  }
  return handoffUrl.toString();
}

function approvalPage(options: {
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  actionTarget?: "_blank";
  statusUrl?: string;
  completionUrl?: string;
  statusMessage?: string;
}): string {
  const action = options.actionUrl
    ? `<a href="${options.actionUrl}" class="btn"${options.actionTarget ? ` target="${options.actionTarget}" rel="noreferrer"` : ""}>${options.actionLabel ?? "Approve"}</a>`
    : "";
  const status = options.statusUrl
    ? `<p id="approval-status">${options.statusMessage ?? "Waiting for HAPP approval..."}</p>`
    : "";
  const pollScript = options.statusUrl && options.completionUrl
    ? `<script>
const statusEl = document.getElementById("approval-status");
const pollUrl = ${JSON.stringify(options.statusUrl)};
const completionUrl = ${JSON.stringify(options.completionUrl)};
let timer = null;
async function pollApproval() {
  try {
    const response = await fetch(pollUrl, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("status " + response.status);
    const payload = await response.json();
    if (payload.status === "approved") {
      if (statusEl) statusEl.textContent = "Approval received. Finishing the flow...";
      window.location.replace(completionUrl);
      return;
    }
    if (payload.status === "denied") {
      if (statusEl) statusEl.textContent = "The HAPP approval was denied.";
      return;
    }
    if (payload.status === "unknown") {
      if (statusEl) statusEl.textContent = "Waiting for the HAPP session to become available...";
    }
  } catch {
    if (statusEl) statusEl.textContent = "Waiting for HAPP approval...";
  }
  timer = window.setTimeout(pollApproval, 1500);
}
pollApproval();
window.addEventListener("beforeunload", () => {
  if (timer !== null) window.clearTimeout(timer);
});
</script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${options.title}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #13223a;
      --muted: #54657f;
      --cta: #0a66d8;
      --cta-hover: #0859bb;
      --border: #d8e1ef;
    }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif;
      background: radial-gradient(circle at top right, #deebff 0%, var(--bg) 45%);
      color: var(--text);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(560px, 100%);
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(18, 43, 76, 0.08);
      padding: 24px;
    }
    h1 {
      font-size: 1.25rem;
      margin: 0 0 8px;
    }
    p {
      line-height: 1.45;
      color: var(--muted);
      margin: 0 0 14px;
      white-space: pre-wrap;
    }
    .btn {
      display: inline-block;
      text-decoration: none;
      background: var(--cta);
      color: white;
      padding: 10px 16px;
      border-radius: 10px;
      font-weight: 600;
    }
    .btn:hover {
      background: var(--cta-hover);
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>${options.title}</h1>
    <p>${options.body}</p>
    ${status}
    ${action}
  </main>
  ${pollScript}
</body>
</html>`;
}

type ApprovalLookup =
  | {
      kind: "workflow";
      workflowId: string;
      approval: WorkflowPendingApproval;
    }
  | {
      kind: "wauth";
      approval: WauthPendingApproval;
    }
  | {
      kind: "none";
    };

type ApprovalCompletionResult =
  | { status: "approved"; body: string }
  | { status: "pending"; body: string }
  | { status: "denied"; body: string }
  | { status: "not_found"; body: string };

async function findPendingApproval(runtime: DemoRuntime, approvalId: string): Promise<ApprovalLookup> {
  const workflowPending = await runtime.workflowService.findPendingApprovalById(approvalId);
  if (workflowPending) {
    return {
      kind: "workflow",
      workflowId: workflowPending.workflowId,
      approval: workflowPending.approval
    };
  }

  const wauthPending = await runtime.wauthService.findPendingApprovalById(approvalId);
  if (wauthPending) {
    return {
      kind: "wauth",
      approval: wauthPending
    };
  }

  return { kind: "none" };
}

function immediateApprovedHappSession(options: {
  requestId: string;
  actionIntent: Record<string, JsonValue>;
  requirements: Record<string, JsonValue>;
  approvalId: string;
  credential: HappPendingSession["credential"];
}): HappPendingSession {
  const createdAt = new Date().toISOString();
  return {
    mode: "local-ref",
    requestId: options.requestId,
    sessionId: `issued-${options.approvalId}`,
    sessionUrl: "",
    sessionApiUrl: "",
    actionIntent: options.actionIntent,
    requirements: options.requirements,
    status: "approved",
    createdAt,
    updatedAt: createdAt,
    credential: options.credential
  };
}

async function ensureWorkflowHappSession(
  runtime: DemoRuntime,
  workflowId: string,
  approval: WorkflowPendingApproval
): Promise<HappPendingSession | undefined> {
  if (runtime.happ.mode !== "local-ref") {
    return approval.happ;
  }
  if (approval.happ) {
    return approval.happ;
  }

  const request = buildWorkflowHappApprovalRequest({
    issuerAudience: issuerBase,
    workflowId,
    approvalId: approval.approvalId,
    stage: approval.stage,
    message: approval.message
  });
  const result = await runtime.happ.client.requestApproval(request);
  if (result.status === "approved") {
    await runtime.workflowService.attachHappSession(
      approval.approvalId,
      immediateApprovedHappSession({
        requestId: request.requestId,
        actionIntent: request.actionIntent,
        requirements: request.requirements,
        approvalId: approval.approvalId,
        credential: result.credential
      })
    );
    await runtime.workflowService.recordHappCredential(approval.approvalId, result.credential);
  } else {
    await runtime.workflowService.attachHappSession(approval.approvalId, result.session);
  }

  const updated = await runtime.workflowService.findPendingApprovalById(approval.approvalId);
  return updated?.approval.happ;
}

async function ensureWauthHappSession(
  runtime: DemoRuntime,
  approval: WauthPendingApproval
): Promise<HappPendingSession | undefined> {
  if (runtime.happ.mode !== "local-ref") {
    return approval.happ;
  }
  if (approval.happ) {
    return approval.happ;
  }

  const requestState = await runtime.wauthService.getRequestState(approval.requestId);
  if (!requestState) {
    throw new Error(`request ${approval.requestId} not found for approval ${approval.approvalId}`);
  }

  const request = buildWauthHappApprovalRequest({
    issuerAudience: issuerBase,
    approvalId: approval.approvalId,
    requestId: requestState.requestId,
    wauthRequired: requestState.wauthRequired,
    actionInstance: requestState.actionInstance
  });
  const result = await runtime.happ.client.requestApproval(request);
  if (result.status === "approved") {
    await runtime.wauthService.attachHappSession(
      approval.approvalId,
      immediateApprovedHappSession({
        requestId: request.requestId,
        actionIntent: request.actionIntent,
        requirements: request.requirements,
        approvalId: approval.approvalId,
        credential: result.credential
      })
    );
    await runtime.wauthService.recordHappCredential(approval.approvalId, result.credential);
  } else {
    await runtime.wauthService.attachHappSession(approval.approvalId, result.session);
  }

  const updated = await runtime.wauthService.findPendingApprovalById(approval.approvalId);
  return updated?.happ;
}

async function approvalStatusForSession(
  runtime: DemoRuntime,
  happ: HappPendingSession
): Promise<HappSessionStatus> {
  if (runtime.happ.mode !== "local-ref") {
    return "unknown";
  }
  if (happ.credential) {
    return "approved";
  }
  const snapshot = await runtime.happ.client.getSessionSnapshot(happ.sessionId);
  return snapshot.status;
}

async function approvalStatusPayload(runtime: DemoRuntime, approvalId: string): Promise<Record<string, JsonValue>> {
  const pending = await findPendingApproval(runtime, approvalId);
  if (pending.kind === "none") {
    return { status: "not_found" };
  }

  if (runtime.happ.mode !== "local-ref") {
    return { status: "unsupported" };
  }

  const happ = pending.kind === "workflow"
    ? await ensureWorkflowHappSession(runtime, pending.workflowId, pending.approval)
    : await ensureWauthHappSession(runtime, pending.approval);
  if (!happ) {
    return { status: "unknown" };
  }

  const status = await approvalStatusForSession(runtime, happ);
  return {
    status,
    sessionUrl: happ.sessionUrl
  };
}

async function completeWorkflowApprovalWithHapp(
  runtime: DemoRuntime,
  workflowId: string,
  approval: WorkflowPendingApproval,
  requestPath: string,
  issuerBaseUrl: string
): Promise<ApprovalCompletionResult> {
  if (runtime.happ.mode !== "local-ref") {
    const progressed = await runtime.workflowService.approveAndAdvanceByApprovalId(approval.approvalId);
    const nextApprovalUrl = progressed.pendingApproval
      ? buildApprovalLandingUrl({
          issuerBaseUrl,
          approvalId: progressed.pendingApproval.approvalId,
          requestPath
        })
      : undefined;
    return {
      status: "approved",
      body: nextApprovalUrl
        ? `Approved. The flow auto-advanced and now waits for the next human checkpoint.\n\nNext approval URL:\n${nextApprovalUrl}`
        : "Approved. The tax flow continued automatically and is now complete."
    };
  }

  const happ = await ensureWorkflowHappSession(runtime, workflowId, approval);
  if (!happ) {
    return {
      status: "pending",
      body: "HAPP approval has not been initialized yet."
    };
  }
  if (!happ.credential) {
    const snapshot = await runtime.happ.client.getSessionSnapshot(happ.sessionId);
    if (snapshot.status === "denied") {
      return {
        status: "denied",
        body: "The HAPP approval was denied, so the tax workflow remains paused."
      };
    }
    if (snapshot.status !== "approved") {
      return {
        status: "pending",
        body: "Still waiting for HAPP approval. Keep the approval page open and complete the verification in HAPP."
      };
    }

    const result = await runtime.happ.client.requestApproval({
      requestId: happ.requestId,
      actionIntent: happ.actionIntent,
      requirements: happ.requirements
    });
    if (result.status !== "approved") {
      return {
        status: "pending",
        body: "HAPP reports that approval is still pending. Try again after the verification completes."
      };
    }

    await verifyHappEnvelope({
      envelope: result.credential,
      actionIntent: happ.actionIntent,
      requirements: happ.requirements,
      expectedAudience: issuerBaseUrl
    });
    await runtime.workflowService.recordHappCredential(approval.approvalId, result.credential);
  }

  const progressed = await runtime.workflowService.approveAndAdvanceByApprovalId(approval.approvalId);
  const nextApprovalUrl = progressed.pendingApproval
    ? buildApprovalLandingUrl({
        issuerBaseUrl,
        approvalId: progressed.pendingApproval.approvalId,
        requestPath
      })
    : undefined;
  return {
    status: "approved",
    body: nextApprovalUrl
      ? `HAPP approval verified. The tax flow auto-advanced and now waits for the next human checkpoint.\n\nNext approval URL:\n${nextApprovalUrl}`
      : "HAPP approval verified. The tax flow continued automatically and is now complete."
  };
}

async function completeWauthApprovalWithHapp(
  runtime: DemoRuntime,
  approval: WauthPendingApproval,
  issuerBaseUrl: string
): Promise<ApprovalCompletionResult> {
  if (runtime.happ.mode !== "local-ref") {
    await runtime.wauthService.approveByApprovalId(approval.approvalId);
    return {
      status: "approved",
      body: "WAUTH request approved and capability issued."
    };
  }

  const happ = await ensureWauthHappSession(runtime, approval);
  if (!happ) {
    return {
      status: "pending",
      body: "HAPP approval has not been initialized yet."
    };
  }
  if (!happ.credential) {
    const snapshot = await runtime.happ.client.getSessionSnapshot(happ.sessionId);
    if (snapshot.status === "denied") {
      return {
        status: "denied",
        body: "The HAPP approval was denied, so capability issuance remains paused."
      };
    }
    if (snapshot.status !== "approved") {
      return {
        status: "pending",
        body: "Still waiting for HAPP approval. Keep the approval page open and complete the verification in HAPP."
      };
    }

    const result = await runtime.happ.client.requestApproval({
      requestId: happ.requestId,
      actionIntent: happ.actionIntent,
      requirements: happ.requirements
    });
    if (result.status !== "approved") {
      return {
        status: "pending",
        body: "HAPP reports that approval is still pending. Try again after the verification completes."
      };
    }

    await verifyHappEnvelope({
      envelope: result.credential,
      actionIntent: happ.actionIntent,
      requirements: happ.requirements,
      expectedAudience: issuerBaseUrl
    });
    await runtime.wauthService.recordHappCredential(approval.approvalId, result.credential);
  }

  await runtime.wauthService.approveByApprovalId(approval.approvalId);
  return {
    status: "approved",
    body: "WAUTH request approved and capability issued after HAPP verification."
  };
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "wauth-demo-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "aaif.demo.tax.file",
    {
      title: "File Taxes",
      description: "Run tax filing automatically and pause only when HAPP approval is required.",
      inputSchema: {
        workflowId: z.string().optional()
      }
    },
    async ({ workflowId }, extra) => {
      const runtime = await getRuntime();
      const result = await runtime.workflowService.runTaxFiling(extra.sessionId, workflowId);

      if (result.pendingApproval) {
        if (runtime.happ.mode === "local-ref") {
          await ensureWorkflowHappSession(runtime, result.workflowId, result.pendingApproval);
        }

        const approvalUrl = buildApprovalLandingUrl({
          issuerBaseUrl: issuerBase,
          approvalId: result.pendingApproval.approvalId,
          requestPath: MCP_REQUEST_PATH
        });
        throw new McpError(ErrorCode.UrlElicitationRequired, result.pendingApproval.message, {
          workflowId: result.workflowId,
          elicitations: [
            {
              elicitationId: result.pendingApproval.approvalId,
              mode: "url",
              message: result.pendingApproval.message,
              url: approvalUrl
            }
          ]
        });
      }

      const status = {
        workflowId: result.workflowId,
        status: result.state.status,
        approvals: result.state.approvals,
        receiptCount: result.result?.receipts.length ?? 0,
        result: result.result
      };

      return {
        content: [
          { type: "text", text: `Tax filing completed for workflow ${result.workflowId}.` },
          { type: "text", text: toolText(status) }
        ],
        structuredContent: asStructuredContent(status)
      };
    }
  );

  server.registerTool(
    "aaif.demo.tax.status",
    {
      title: "Tax Status",
      description: "Get current status of the active or specified tax workflow.",
      inputSchema: {
        workflowId: z.string().optional()
      }
    },
    async ({ workflowId }, extra) => {
      const runtime = await getRuntime();
      const state = await runtime.workflowService.status(extra.sessionId, workflowId);
      const payload = state ?? { status: "not_found" };
      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: asStructuredContent(payload)
      };
    }
  );

  server.registerTool(
    "aaif.demo.tax.pending_approvals",
    {
      title: "Pending Approvals",
      description: "List pending HAPP approvals for a workflow.",
      inputSchema: {
        workflowId: z.string().optional()
      }
    },
    async ({ workflowId }, extra) => {
      const runtime = await getRuntime();
      const resolvedWorkflowId = await runtime.workflowService.resolveSessionWorkflowId(extra.sessionId, workflowId);
      const approvals = resolvedWorkflowId
        ? await runtime.workflowService.listPendingApprovals(resolvedWorkflowId)
        : [];
      const payload = {
        workflowId: resolvedWorkflowId,
        approvals: approvals.map((approval) => ({
          ...approval,
          approvalUrl: buildApprovalLandingUrl({
            issuerBaseUrl: issuerBase,
            approvalId: approval.approvalId,
            requestPath: MCP_REQUEST_PATH
          })
        }))
      };

      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: asStructuredContent(payload)
      };
    }
  );

  server.registerTool(
    "aaif.demo.tax.approve",
    {
      title: "Approve Tax Step",
      description: "Manually approve a pending checkpoint and auto-advance the tax flow.",
      inputSchema: {
        approvalId: z.string(),
        workflowId: z.string().optional()
      }
    },
    async ({ approvalId, workflowId }, extra) => {
      const runtime = await getRuntime();
      const result = await runtime.workflowService.approveAndAdvanceBySession(extra.sessionId, approvalId, workflowId);
      const payload = {
        workflowId: result.workflowId,
        status: result.state.status,
        approvals: result.state.approvals,
        pendingApproval: result.pendingApproval
          ? {
              ...result.pendingApproval,
              approvalUrl: buildApprovalLandingUrl({
                issuerBaseUrl: issuerBase,
                approvalId: result.pendingApproval.approvalId,
                requestPath: MCP_REQUEST_PATH
              })
            }
          : undefined,
        receiptCount: result.result?.receipts.length ?? 0
      };
      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: asStructuredContent(payload)
      };
    }
  );

  server.registerTool(
    "aaif.demo.tax.timeline",
    {
      title: "Tax Timeline",
      description: "Get audit timeline events for a workflow.",
      inputSchema: {
        workflowId: z.string().optional()
      }
    },
    async ({ workflowId }, extra) => {
      const runtime = await getRuntime();
      const resolvedWorkflowId = await runtime.workflowService.resolveSessionWorkflowId(extra.sessionId, workflowId);
      const timeline = resolvedWorkflowId
        ? await runtime.workflowService.timeline(resolvedWorkflowId)
        : [];
      const payload = {
        workflowId: resolvedWorkflowId,
        timeline
      };
      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: asStructuredContent(payload)
      };
    }
  );

  server.registerTool(
    "aaif.demo.tax.reset",
    {
      title: "Reset Demo State",
      description: "Reset tax and/or WAUTH state for this demo server.",
      inputSchema: {
        workflowId: z.string().optional(),
        requestId: z.string().optional(),
        all: z.boolean().optional()
      }
    },
    async ({ workflowId, requestId, all }) => {
      const runtime = await getRuntime();
      if (all) {
        await runtime.workflowService.reset();
        await runtime.wauthService.reset();
      } else {
        if (workflowId) {
          await runtime.workflowService.reset(workflowId);
        }
        if (requestId) {
          await runtime.wauthService.reset(requestId);
        }
      }

      const payload = {
        ok: true,
        reset: {
          all: Boolean(all),
          workflowId: workflowId ?? null,
          requestId: requestId ?? null
        }
      };

      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: asStructuredContent(payload)
      };
    }
  );

  server.registerTool(
    "aaif.wauth.request",
    {
      title: "WAUTH Request",
      description: "Request bounded WAUTH capability issuance for an RP requirement.",
      inputSchema: {
        requestId: z.string().optional(),
        wauthRequired: z.record(z.string(), z.unknown()),
        actionInstance: z.record(z.string(), z.unknown()).optional(),
        agentIdentity: z.record(z.string(), z.unknown()).optional()
      }
    },
    async ({ requestId, wauthRequired, actionInstance, agentIdentity }, extra) => {
      const runtime = await getRuntime();
      const request = await runtime.wauthService.request(extra.sessionId, {
        requestId,
        wauthRequired: wauthRequired as Record<string, JsonValue>,
        actionInstance: actionInstance as JsonValue | undefined,
        agentIdentity: toRecord(agentIdentity)
      });

      if (request.pendingApproval) {
        if (runtime.happ.mode === "local-ref") {
          await ensureWauthHappSession(runtime, request.pendingApproval);
        }

        const approvalUrl = buildApprovalLandingUrl({
          issuerBaseUrl: issuerBase,
          approvalId: request.pendingApproval.approvalId,
          requestPath: MCP_REQUEST_PATH
        });
        throw new McpError(ErrorCode.UrlElicitationRequired, request.pendingApproval.message, {
          requestId: request.requestId,
          elicitations: [
            {
              elicitationId: request.pendingApproval.approvalId,
              mode: "url",
              message: request.pendingApproval.message,
              url: approvalUrl
            }
          ]
        });
      }

      if (!request.envelope) {
        throw new Error(`request ${request.requestId} did not produce envelope`);
      }

      return {
        content: [{ type: "text", text: toolText(request.envelope) }],
        structuredContent: asStructuredContent(request.envelope)
      };
    }
  );

  server.registerTool(
    "aaif.wauth.get",
    {
      title: "WAUTH Get",
      description: "Retrieve a WAUTH artifact by reference.",
      inputSchema: {
        ref: z.string()
      }
    },
    async ({ ref }) => {
      const runtime = await getRuntime();
      const artifact = await runtime.wauthService.getArtifact(ref);
      return {
        content: [{ type: "text", text: toolText(artifact) }],
        structuredContent: asStructuredContent(artifact)
      };
    }
  );

  server.registerTool(
    "aaif.wauth.metadata",
    {
      title: "WAUTH Metadata",
      description: "Return WAUTH metadata envelope for this demo.",
      inputSchema: {}
    },
    async () => {
      const runtime = await getRuntime();
      const metadata = await runtime.wauthService.metadata();
      return {
        content: [{ type: "text", text: toolText(metadata) }],
        structuredContent: asStructuredContent(metadata)
      };
    }
  );

  return server;
}

export async function startMcpHttpServer(port = DEFAULT_PORT): Promise<void> {
  const app = buildMcpExpressApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`WAUTH demo MCP server listening on port ${port}`);
  });
}

export function buildMcpExpressApp(options: {
  runtime?: DemoRuntime;
  issuerBaseUrl?: string;
} = {}) {
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  const providedRuntime = options.runtime;
  const resolvedIssuerBaseUrl = trimTrailingSlash(options.issuerBaseUrl ?? issuerBase);
  const transports: Record<string, StreamableHTTPServerTransport> = {};
  const mcpPaths = ["/mcp", "/api/mcp"] as const;
  const configPaths = [
    "/.well-known/aaif-wauth-configuration",
    "/api/.well-known/aaif-wauth-configuration"
  ] as const;
  const jwksPaths = ["/jwks", "/api/jwks"] as const;
  const approvalPaths = ["/iproov/approve", "/api/iproov/approve"] as const;
  const approvalStatusPaths = ["/iproov/approve/status", "/api/iproov/approve/status"] as const;
  const approvalCompletePaths = [
    "/iproov/approve/complete",
    "/api/iproov/approve/complete"
  ] as const;
  const healthPaths = ["/healthz", "/api/healthz"] as const;
  const mockRpPaths = [
    "/",
    "/api",
    "/bank",
    "/api/bank",
    "/hr",
    "/api/hr",
    "/employer",
    "/api/employer",
    "/irs",
    "/api/irs",
    "/tax-office",
    "/api/tax-office"
  ] as const;
  const mockRpSurfacePaths = mockRpPaths.filter((path) => path !== "/" && path !== "/api");
  const mockRpPrmPaths = mockRpSurfacePaths.map((path) => `${path}${RP_PRM_SUFFIX}`);
  const mockRpRequirementsPaths = mockRpSurfacePaths.map((path) => `${path}${RP_REQUIREMENTS_SUFFIX}`);

  for (const routePath of mockRpPaths) {
    app.get(routePath, (req: Request, res: Response) => {
      if (isMockRpDirectoryPath(req.path)) {
        res.send(renderMockRpDirectoryPage(req.path));
        return;
      }

      const page = findMockRpPage(req.path);
      if (!page) {
        res.status(404).send("Not found");
        return;
      }

      res.send(renderMockRpLandingPage(page, req.path));
    });
  }

  for (const routePath of mockRpPrmPaths) {
    app.get(routePath, (req: Request, res: Response) => {
      const resourcePath = stripKnownSuffix(req.path, RP_PRM_SUFFIX);
      if (!resourcePath) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const page = findMockRpPage(resourcePath);
      if (!page) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const origin = externalOriginForRequest(req, resolvedIssuerBaseUrl);
      res.json(buildMockRpProtectedResourceMetadata({
        page,
        resourcePath,
        origin,
        authorizationServer: resolvedIssuerBaseUrl
      }));
    });
  }

  for (const routePath of mockRpRequirementsPaths) {
    app.get(routePath, (req: Request, res: Response) => {
      const resourcePath = stripKnownSuffix(req.path, RP_REQUIREMENTS_SUFFIX);
      if (!resourcePath) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const page = findMockRpPage(resourcePath);
      if (!page) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(buildMockRpRequirements(page));
    });
  }

  for (const routePath of mcpPaths) {
    app.post(routePath, async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport | undefined = sessionId
          ? transports[sessionId]
          : undefined;

        if (!transport && !sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (generatedSessionId) => {
              transports[generatedSessionId] = transport!;
            }
          });

          const server = createServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        }

        if (!transport) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided"
            },
            id: null
          });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : "Internal server error"
            },
            id: null
          });
        }
      }
    });
  }

  for (const routePath of mcpPaths) {
    app.get(routePath, async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? transports[sessionId] : undefined;

      if (!transport) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      await transport.handleRequest(req, res);
    });
  }

  for (const routePath of mcpPaths) {
    app.delete(routePath, async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? transports[sessionId] : undefined;
      if (!transport) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      await transport.handleRequest(req, res);
      if (sessionId) {
        delete transports[sessionId];
      }
    });
  }

  for (const routePath of configPaths) {
    app.get(routePath, async (_req: Request, res: Response) => {
      const runtime = providedRuntime ?? await getRuntime();
      const metadata = await runtime.wauthService.metadata();
      res.json(metadata);
    });
  }

  for (const routePath of jwksPaths) {
    app.get(routePath, async (_req: Request, res: Response) => {
      const runtime = providedRuntime ?? await getRuntime();
      const jwks = await runtime.wauthService.jwks();
      res.json(jwks);
    });
  }

  for (const routePath of approvalPaths) {
    app.get(routePath, async (req: Request, res: Response) => {
      const runtime = providedRuntime ?? await getRuntime();
      const approvalId = queryString(req.query.approval_id);
      if (!approvalId) {
        res.status(400).send(approvalPage({
          title: "Approval link invalid",
          body: "Missing approval_id query parameter."
        }));
        return;
      }

      const pending = await findPendingApproval(runtime, approvalId);
      if (pending.kind === "none") {
        res.status(404).send(approvalPage({
          title: "Approval not found",
          body: "This approval is no longer pending or has already been used."
        }));
        return;
      }

      const body = pending.kind === "workflow"
        ? `${pending.approval.message}\n\nWorkflow: ${pending.workflowId}`
        : `${pending.approval.message}\n\nRequest: ${pending.approval.requestId}`;

      if (runtime.happ.mode === "local-ref") {
        const happ = pending.kind === "workflow"
          ? await ensureWorkflowHappSession(runtime, pending.workflowId, pending.approval)
          : await ensureWauthHappSession(runtime, pending.approval);
        if (!happ) {
          res.status(500).send(approvalPage({
            title: "Approval unavailable",
            body: "The HAPP session could not be initialized."
          }));
          return;
        }

        res.send(approvalPage({
          title: "HAPP Approval Required",
          body: `${body}\n\nOpen the HAPP approval in a new tab, complete the verification there, and keep this page open while the demo resumes.`,
          actionUrl: happ.sessionUrl,
          actionLabel: "Open HAPP Approval",
          actionTarget: "_blank",
          statusUrl: buildApprovalStatusUrl({
            issuerBaseUrl: resolvedIssuerBaseUrl,
            approvalId,
            requestPath: req.path
          }),
          completionUrl: buildApprovalCompletionUrl(resolvedIssuerBaseUrl, approvalId, req.path),
          statusMessage: "Waiting for HAPP approval..."
        }));
        return;
      }

      const happApprovalUrl = buildHappApprovalHandoffUrl({
        happBaseUrl: runtime.happ.baseUrl,
        issuerBaseUrl: resolvedIssuerBaseUrl,
        approvalId,
        requestPath: req.path,
        workflowId: pending.kind === "workflow" ? pending.workflowId : undefined,
        requestId: pending.kind === "wauth" ? pending.approval.requestId : undefined
      });
      res.send(approvalPage({
        title: "iProov Approval Required",
        body: `${body}\n\nContinue in HAPP to complete iProov verification.`,
        actionUrl: happApprovalUrl,
        actionLabel: "Continue In HAPP"
      }));
    });
  }

  for (const routePath of approvalStatusPaths) {
    app.get(routePath, async (req: Request, res: Response) => {
      const runtime = providedRuntime ?? await getRuntime();
      const approvalId = queryString(req.query.approval_id);
      if (!approvalId) {
        res.status(400).json({
          approvalId: null,
          status: "invalid"
        });
        return;
      }

      const payload = await approvalStatusPayload(runtime, approvalId);
      res.json(payload);
    });
  }

  for (const routePath of approvalCompletePaths) {
    app.get(routePath, async (req: Request, res: Response) => {
      const runtime = providedRuntime ?? await getRuntime();
      const approvalId = queryString(req.query.approval_id);
      if (!approvalId) {
        res.status(400).send(approvalPage({
          title: "Approval link invalid",
          body: "Missing approval_id query parameter."
        }));
        return;
      }

      const pending = await findPendingApproval(runtime, approvalId);
      if (pending.kind === "none") {
        res.status(404).send(approvalPage({
          title: "Approval not found",
          body: "This approval is no longer pending or has already been used."
        }));
        return;
      }

      const completion = pending.kind === "workflow"
        ? await completeWorkflowApprovalWithHapp(runtime, pending.workflowId, pending.approval, req.path, resolvedIssuerBaseUrl)
        : await completeWauthApprovalWithHapp(runtime, pending.approval, resolvedIssuerBaseUrl);
      const statusCode = completion.status === "approved"
        ? 200
        : completion.status === "pending"
          ? 409
          : completion.status === "denied"
            ? 409
            : 404;
      res.status(statusCode).send(approvalPage({
        title: completion.status === "approved"
          ? "Approval Completed"
          : completion.status === "denied"
            ? "Approval Denied"
            : completion.status === "pending"
              ? "Approval Still Pending"
              : "Approval not found",
        body: completion.body
      }));
    });
  }

  for (const routePath of healthPaths) {
    app.get(routePath, async (_req: Request, res: Response) => {
      const runtime = providedRuntime ?? await getRuntime();
      res.json({
        ok: true,
        service: "wauth-demo-mcp",
        happMode: runtime.happ.mode
      });
    });
  }

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  startMcpHttpServer(port).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("failed to start MCP server", error);
    process.exit(1);
  });
}
