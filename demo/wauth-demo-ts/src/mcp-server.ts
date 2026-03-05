import { randomUUID } from "node:crypto";

import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { ErrorCode, McpError, isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { TaxWorkflowService } from "./workflow.js";
import { WauthRequestService } from "./wauth-state.js";
import type { JsonValue } from "./sdk.js";

const DEFAULT_PORT = 3000;
const DEFAULT_ISSUER = process.env.WAUTH_DEMO_ISSUER ?? "https://wauth-demo.showntell.dev";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const issuerBase = trimTrailingSlash(DEFAULT_ISSUER);
const approvalBaseUrl = `${issuerBase}/iproov/approve`;

const workflowService = new TaxWorkflowService({
  dataFilePath: process.env.WAUTH_DEMO_STATE_FILE,
  approvalBaseUrl
});

const wauthService = new WauthRequestService({
  issuer: issuerBase,
  dataFilePath: process.env.WAUTH_DEMO_WAUTH_STATE_FILE,
  approvalBaseUrl
});

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

function approvalPage(options: {
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
}): string {
  const action = options.actionUrl
    ? `<a href="${options.actionUrl}" class="btn">${options.actionLabel ?? "Approve"}</a>`
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
      width: min(540px, 100%);
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
    ${action}
  </main>
</body>
</html>`;
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
      description: "Run tax filing automatically and pause only when iProov approval is required.",
      inputSchema: {
        workflowId: z.string().optional()
      }
    },
    async ({ workflowId }, extra) => {
      const sessionId = extra.sessionId;
      const result = await workflowService.runTaxFiling(sessionId, workflowId);

      if (result.pendingApproval) {
        throw new McpError(ErrorCode.UrlElicitationRequired, result.pendingApproval.message, {
          workflowId: result.workflowId,
          elicitations: [
            {
              elicitationId: result.pendingApproval.approvalId,
              mode: "url",
              message: result.pendingApproval.message,
              url: result.pendingApproval.approvalUrl
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
          {
            type: "text",
            text: `Tax filing completed for workflow ${result.workflowId}.`
          },
          {
            type: "text",
            text: toolText(status)
          }
        ],
        structuredContent: status
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
      const state = await workflowService.status(extra.sessionId, workflowId);
      const payload = state ?? { status: "not_found" };
      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: payload
      };
    }
  );

  server.registerTool(
    "aaif.demo.tax.pending_approvals",
    {
      title: "Pending Approvals",
      description: "List pending iProov approvals for a workflow.",
      inputSchema: {
        workflowId: z.string().optional()
      }
    },
    async ({ workflowId }, extra) => {
      const resolvedWorkflowId = await workflowService.resolveSessionWorkflowId(extra.sessionId, workflowId);
      const approvals = resolvedWorkflowId
        ? await workflowService.listPendingApprovals(resolvedWorkflowId)
        : [];

      const payload = {
        workflowId: resolvedWorkflowId,
        approvals
      };

      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: payload
      };
    }
  );

  server.registerTool(
    "aaif.demo.tax.approve",
    {
      title: "Approve iProov Step",
      description: "Approve a pending iProov checkpoint and auto-advance the tax flow.",
      inputSchema: {
        approvalId: z.string(),
        workflowId: z.string().optional()
      }
    },
    async ({ approvalId, workflowId }, extra) => {
      const result = await workflowService.approveAndAdvanceBySession(extra.sessionId, approvalId, workflowId);
      const payload = {
        workflowId: result.workflowId,
        status: result.state.status,
        approvals: result.state.approvals,
        pendingApproval: result.pendingApproval,
        receiptCount: result.result?.receipts.length ?? 0
      };
      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: payload
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
      const resolvedWorkflowId = await workflowService.resolveSessionWorkflowId(extra.sessionId, workflowId);
      const timeline = resolvedWorkflowId
        ? await workflowService.timeline(resolvedWorkflowId)
        : [];
      const payload = {
        workflowId: resolvedWorkflowId,
        timeline
      };
      return {
        content: [{ type: "text", text: toolText(payload) }],
        structuredContent: payload
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
      if (all) {
        await workflowService.reset();
        await wauthService.reset();
      } else {
        if (workflowId) {
          await workflowService.reset(workflowId);
        }
        if (requestId) {
          await wauthService.reset(requestId);
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
        structuredContent: payload
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
      const request = await wauthService.request(extra.sessionId, {
        requestId,
        wauthRequired: wauthRequired as Record<string, JsonValue>,
        actionInstance: actionInstance as JsonValue | undefined,
        agentIdentity: toRecord(agentIdentity)
      });

      if (request.pendingApproval) {
        throw new McpError(ErrorCode.UrlElicitationRequired, request.pendingApproval.message, {
          requestId: request.requestId,
          elicitations: [
            {
              elicitationId: request.pendingApproval.approvalId,
              mode: "url",
              message: request.pendingApproval.message,
              url: request.pendingApproval.approvalUrl
            }
          ]
        });
      }

      if (!request.envelope) {
        throw new Error(`request ${request.requestId} did not produce envelope`);
      }

      return {
        content: [{ type: "text", text: toolText(request.envelope) }],
        structuredContent: request.envelope
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
      const artifact = await wauthService.getArtifact(ref);
      return {
        content: [{ type: "text", text: toolText(artifact) }],
        structuredContent: artifact
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
      const metadata = await wauthService.metadata();
      return {
        content: [{ type: "text", text: toolText(metadata) }],
        structuredContent: metadata
      };
    }
  );

  return server;
}

export async function startMcpHttpServer(port = DEFAULT_PORT): Promise<void> {
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post("/mcp", async (req, res) => {
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

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    await transport.handleRequest(req, res);
    delete transports[sessionId];
  });

  app.get("/.well-known/aaif-wauth-configuration", async (_req, res) => {
    const metadata = await wauthService.metadata();
    res.json(metadata);
  });

  app.get("/jwks", async (_req, res) => {
    const jwks = await wauthService.jwks();
    res.json(jwks);
  });

  app.get("/iproov/approve", async (req, res) => {
    const approvalId = queryString(req.query.approval_id);
    if (!approvalId) {
      res.status(400).send(approvalPage({
        title: "Approval link invalid",
        body: "Missing approval_id query parameter."
      }));
      return;
    }

    const workflowPending = await workflowService.findPendingApprovalById(approvalId);
    const wauthPending = workflowPending ? undefined : await wauthService.findPendingApprovalById(approvalId);

    if (!workflowPending && !wauthPending) {
      res.status(404).send(approvalPage({
        title: "Approval not found",
        body: "This approval is no longer pending or has already been used."
      }));
      return;
    }

    const body = workflowPending
      ? `${workflowPending.approval.message}\n\nWorkflow: ${workflowPending.workflowId}`
      : `${wauthPending!.message}\n\nRequest: ${wauthPending!.requestId}`;

    res.send(approvalPage({
      title: "iProov Approval Required",
      body,
      actionUrl: `/iproov/approve/complete?approval_id=${encodeURIComponent(approvalId)}`,
      actionLabel: "Approve With iProov"
    }));
  });

  app.get("/iproov/approve/complete", async (req, res) => {
    const approvalId = queryString(req.query.approval_id);
    if (!approvalId) {
      res.status(400).send(approvalPage({
        title: "Approval link invalid",
        body: "Missing approval_id query parameter."
      }));
      return;
    }

    const workflowPending = await workflowService.findPendingApprovalById(approvalId);
    if (workflowPending) {
      const progressed = await workflowService.approveAndAdvanceByApprovalId(approvalId);
      const completionBody = progressed.pendingApproval
        ? `Approved. The flow auto-advanced and now waits for the next human checkpoint.\n\nNext approval URL:\n${progressed.pendingApproval.approvalUrl}`
        : `Approved. The tax flow continued automatically and is now complete.`;

      res.send(approvalPage({
        title: "Approval Completed",
        body: completionBody
      }));
      return;
    }

    const wauthPending = await wauthService.findPendingApprovalById(approvalId);
    if (wauthPending) {
      await wauthService.approveByApprovalId(approvalId);
      res.send(approvalPage({
        title: "Approval Completed",
        body: "WAUTH request approved and capability issued."
      }));
      return;
    }

    res.status(404).send(approvalPage({
      title: "Approval not found",
      body: "This approval is no longer pending or has already been used."
    }));
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "wauth-demo-mcp" });
  });

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`WAUTH demo MCP server listening on port ${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  startMcpHttpServer(port).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("failed to start MCP server", error);
    process.exit(1);
  });
}
