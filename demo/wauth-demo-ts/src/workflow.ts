import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type { HappConsentCredentialEnvelope, HappPendingSession } from "./happ-local-ref.js";
import { runTaxDemoScenario, type DemoTimelineEvent, type TaxDemoRunResult } from "./engine.js";
import type { JsonValue } from "./sdk.js";

export type ApprovalStage = "read_evidence" | "final_submit";

export interface PendingApproval {
  approvalId: string;
  stage: ApprovalStage;
  message: string;
  approvalUrl: string;
  createdAt: string;
  happ?: HappPendingSession;
}

export interface TaxWorkflowState {
  workflowId: string;
  createdAt: string;
  updatedAt: string;
  status: "pending_approval" | "running" | "complete";
  approvals: {
    read_evidence: boolean;
    final_submit: boolean;
  };
  pendingApproval?: PendingApproval;
  result?: TaxDemoRunResult;
  events: DemoTimelineEvent[];
}

export interface RunWorkflowResult {
  workflowId: string;
  state: TaxWorkflowState;
  pendingApproval?: PendingApproval;
  result?: TaxDemoRunResult;
}

interface PersistedData {
  workflows: Record<string, TaxWorkflowState>;
  sessionToWorkflow: Record<string, string>;
}

const DEFAULT_DATA_FILE = resolve(process.cwd(), ".wauth-demo", "workflow-state.json");
const DEFAULT_APPROVAL_BASE_URL = "https://iproov.demo.local/approve";

export interface TaxWorkflowServiceOptions {
  dataFilePath?: string;
  approvalBaseUrl?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneState(state: TaxWorkflowState): TaxWorkflowState {
  return JSON.parse(JSON.stringify(state)) as TaxWorkflowState;
}

function approvalMessage(stage: ApprovalStage): string {
  if (stage === "read_evidence") {
    return "Approval needed to continue. Please verify your identity for read-only evidence collection (bank and employer).";
  }
  return "Final approval needed. Please verify your identity to submit your tax return.";
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function approvalUrl(approvalBaseUrl: string, workflowId: string, approvalId: string): string {
  const baseUrl = trimTrailingSlash(approvalBaseUrl);
  return `${baseUrl}?workflow_id=${encodeURIComponent(workflowId)}&approval_id=${encodeURIComponent(approvalId)}`;
}

export class TaxWorkflowService {
  private readonly workflows = new Map<string, TaxWorkflowState>();
  private readonly sessionToWorkflow = new Map<string, string>();
  private readonly dataFilePath: string;
  private readonly approvalBaseUrl: string;
  private loadPromise: Promise<void>;

  constructor(options: string | TaxWorkflowServiceOptions = DEFAULT_DATA_FILE) {
    if (typeof options === "string") {
      this.dataFilePath = options;
      this.approvalBaseUrl = DEFAULT_APPROVAL_BASE_URL;
    } else {
      this.dataFilePath = options.dataFilePath ?? DEFAULT_DATA_FILE;
      this.approvalBaseUrl = options.approvalBaseUrl ?? DEFAULT_APPROVAL_BASE_URL;
    }
    this.loadPromise = this.load();
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.dataFilePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedData;
      for (const [workflowId, state] of Object.entries(parsed.workflows ?? {})) {
        this.workflows.set(workflowId, state);
      }
      for (const [sessionId, workflowId] of Object.entries(parsed.sessionToWorkflow ?? {})) {
        this.sessionToWorkflow.set(sessionId, workflowId);
      }
    } catch {
      // No existing state file on first run.
    }
  }

  private async persist(): Promise<void> {
    const payload: PersistedData = {
      workflows: Object.fromEntries(this.workflows.entries()),
      sessionToWorkflow: Object.fromEntries(this.sessionToWorkflow.entries())
    };
    await mkdir(dirname(this.dataFilePath), { recursive: true });
    await writeFile(this.dataFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private async ready(): Promise<void> {
    await this.loadPromise;
  }

  private resolveWorkflowId(
    sessionId: string | undefined,
    requestedWorkflowId?: string,
    createIfMissing = true
  ): string | undefined {
    if (requestedWorkflowId && requestedWorkflowId.length > 0) {
      if (sessionId) {
        this.sessionToWorkflow.set(sessionId, requestedWorkflowId);
      }
      return requestedWorkflowId;
    }

    if (sessionId) {
      const existing = this.sessionToWorkflow.get(sessionId);
      if (existing) {
        return existing;
      }
      if (!createIfMissing) {
        return undefined;
      }
      const generated = `wf_${randomUUID()}`;
      this.sessionToWorkflow.set(sessionId, generated);
      return generated;
    }

    if (!createIfMissing) {
      return undefined;
    }
    return `wf_${randomUUID()}`;
  }

  private ensureState(workflowId: string): TaxWorkflowState {
    const existing = this.workflows.get(workflowId);
    if (existing) {
      return existing;
    }

    const created: TaxWorkflowState = {
      workflowId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: "running",
      approvals: {
        read_evidence: false,
        final_submit: false
      },
      events: []
    };
    this.workflows.set(workflowId, created);
    return created;
  }

  private createPendingApproval(state: TaxWorkflowState, stage: ApprovalStage): PendingApproval {
    const approvalId = `approve_${stage}_${randomUUID()}`;
    const pending: PendingApproval = {
      approvalId,
      stage,
      message: approvalMessage(stage),
      approvalUrl: approvalUrl(this.approvalBaseUrl, state.workflowId, approvalId),
      createdAt: nowIso()
    };
    state.pendingApproval = pending;
    state.status = "pending_approval";
    state.updatedAt = nowIso();
    state.events.push({
      at: nowIso(),
      type: "approval.requested",
      detail: {
        workflow_id: state.workflowId,
        approval_id: pending.approvalId,
        stage: pending.stage
      } as Record<string, JsonValue>
    });
    return pending;
  }

  private findPendingWorkflowState(approvalId: string): TaxWorkflowState {
    for (const state of this.workflows.values()) {
      if (state.pendingApproval?.approvalId === approvalId) {
        return state;
      }
    }
    throw new Error(`approval ${approvalId} is not pending`);
  }

  async runTaxFiling(sessionId: string | undefined, requestedWorkflowId?: string): Promise<RunWorkflowResult> {
    await this.ready();

    const workflowId = this.resolveWorkflowId(sessionId, requestedWorkflowId, true);
    if (!workflowId) {
      throw new Error("failed to resolve workflow id");
    }
    const state = this.ensureState(workflowId);

    if (state.pendingApproval) {
      return {
        workflowId,
        state: cloneState(state),
        pendingApproval: state.pendingApproval
      };
    }

    if (!state.approvals.read_evidence) {
      const pending = this.createPendingApproval(state, "read_evidence");
      await this.persist();
      return {
        workflowId,
        state: cloneState(state),
        pendingApproval: pending
      };
    }

    if (!state.approvals.final_submit) {
      const pending = this.createPendingApproval(state, "final_submit");
      await this.persist();
      return {
        workflowId,
        state: cloneState(state),
        pendingApproval: pending
      };
    }

    if (!state.result) {
      state.status = "running";
      state.updatedAt = nowIso();
      state.events.push({
        at: nowIso(),
        type: "tax_flow.started",
        detail: {
          workflow_id: workflowId
        } as Record<string, JsonValue>
      });

      const result = await runTaxDemoScenario();
      state.result = result;
      state.status = "complete";
      state.updatedAt = nowIso();
      state.events.push({
        at: nowIso(),
        type: "tax_flow.completed",
        detail: {
          workflow_id: workflowId,
          receipts: result.receipts.length
        } as Record<string, JsonValue>
      });
    }

    await this.persist();
    return {
      workflowId,
      state: cloneState(state),
      result: state.result
    };
  }

  async approve(workflowId: string, approvalId: string): Promise<TaxWorkflowState> {
    await this.ready();

    const state = this.workflows.get(workflowId);
    if (!state) {
      throw new Error(`unknown workflow: ${workflowId}`);
    }
    if (!state.pendingApproval) {
      throw new Error(`workflow ${workflowId} has no pending approval`);
    }
    if (state.pendingApproval.approvalId !== approvalId) {
      throw new Error(`approval ${approvalId} does not match pending approval`);
    }

    const stage = state.pendingApproval.stage;
    state.approvals[stage] = true;
    state.events.push({
      at: nowIso(),
      type: "approval.granted",
      detail: {
        workflow_id: workflowId,
        approval_id: approvalId,
        stage
      } as Record<string, JsonValue>
    });
    state.pendingApproval = undefined;
    state.status = "running";
    state.updatedAt = nowIso();

    await this.persist();
    return cloneState(state);
  }

  async status(sessionId: string | undefined, requestedWorkflowId?: string): Promise<TaxWorkflowState | undefined> {
    await this.ready();
    const workflowId = this.resolveWorkflowId(sessionId, requestedWorkflowId, false);
    if (!workflowId) {
      return undefined;
    }
    const state = this.workflows.get(workflowId);
    return state ? cloneState(state) : undefined;
  }

  async approveBySession(
    sessionId: string | undefined,
    approvalId: string,
    requestedWorkflowId?: string
  ): Promise<TaxWorkflowState> {
    await this.ready();
    const workflowId = this.resolveWorkflowId(sessionId, requestedWorkflowId, false);
    if (!workflowId) {
      throw new Error("no workflow for this session");
    }
    return this.approve(workflowId, approvalId);
  }

  async approveByApprovalId(approvalId: string): Promise<TaxWorkflowState> {
    await this.ready();
    const state = this.findPendingWorkflowState(approvalId);
    return this.approve(state.workflowId, approvalId);
  }

  async approveAndAdvanceBySession(
    sessionId: string | undefined,
    approvalId: string,
    requestedWorkflowId?: string
  ): Promise<RunWorkflowResult> {
    const approved = await this.approveBySession(sessionId, approvalId, requestedWorkflowId);
    return this.runTaxFiling(sessionId, approved.workflowId);
  }

  async approveAndAdvanceByApprovalId(approvalId: string): Promise<RunWorkflowResult> {
    const approved = await this.approveByApprovalId(approvalId);
    return this.runTaxFiling(undefined, approved.workflowId);
  }

  async resolveSessionWorkflowId(
    sessionId: string | undefined,
    requestedWorkflowId?: string
  ): Promise<string | undefined> {
    await this.ready();
    return this.resolveWorkflowId(sessionId, requestedWorkflowId, false);
  }

  async listPendingApprovals(workflowId: string): Promise<PendingApproval[]> {
    await this.ready();
    const state = this.workflows.get(workflowId);
    if (!state?.pendingApproval) {
      return [];
    }
    return [state.pendingApproval];
  }

  async findPendingApprovalById(
    approvalId: string
  ): Promise<{ workflowId: string; approval: PendingApproval } | undefined> {
    await this.ready();
    for (const [workflowId, state] of this.workflows.entries()) {
      if (state.pendingApproval?.approvalId === approvalId) {
        return {
          workflowId,
          approval: state.pendingApproval
        };
      }
    }
    return undefined;
  }

  async attachHappSession(approvalId: string, happ: HappPendingSession): Promise<PendingApproval> {
    await this.ready();
    const state = this.findPendingWorkflowState(approvalId);
    if (!state.pendingApproval) {
      throw new Error(`approval ${approvalId} is no longer pending`);
    }

    state.pendingApproval.happ = JSON.parse(JSON.stringify(happ)) as HappPendingSession;
    state.updatedAt = nowIso();
    state.events.push({
      at: nowIso(),
      type: "approval.happ.session_created",
      detail: {
        workflow_id: state.workflowId,
        approval_id: approvalId,
        happ_request_id: happ.requestId,
        happ_session_id: happ.sessionId
      } as Record<string, JsonValue>
    });
    await this.persist();
    return cloneState(state).pendingApproval!;
  }

  async recordHappCredential(
    approvalId: string,
    credential: HappConsentCredentialEnvelope
  ): Promise<PendingApproval> {
    await this.ready();
    const state = this.findPendingWorkflowState(approvalId);
    if (!state.pendingApproval) {
      throw new Error(`approval ${approvalId} is no longer pending`);
    }
    if (!state.pendingApproval.happ) {
      throw new Error(`approval ${approvalId} has no HAPP session`);
    }

    state.pendingApproval.happ = {
      ...state.pendingApproval.happ,
      status: "approved",
      credential: JSON.parse(JSON.stringify(credential)) as HappConsentCredentialEnvelope,
      updatedAt: nowIso()
    };
    state.updatedAt = nowIso();
    state.events.push({
      at: nowIso(),
      type: "approval.happ.verified",
      detail: {
        workflow_id: state.workflowId,
        approval_id: approvalId,
        happ_session_id: state.pendingApproval.happ.sessionId,
        format: credential.format,
        issuer: typeof credential.claims.issuer === "string" ? credential.claims.issuer : undefined,
        audience: typeof credential.claims.aud === "string" ? credential.claims.aud : undefined,
        assurance_level: typeof (credential.claims.assurance as Record<string, JsonValue> | undefined)?.level === "string"
          ? (credential.claims.assurance as Record<string, JsonValue>).level
          : undefined,
        verified_at: typeof (credential.claims.assurance as Record<string, JsonValue> | undefined)?.verifiedAt === "string"
          ? (credential.claims.assurance as Record<string, JsonValue>).verifiedAt
          : undefined
      } as Record<string, JsonValue>
    });
    await this.persist();
    return cloneState(state).pendingApproval!;
  }

  async timeline(workflowId: string): Promise<DemoTimelineEvent[]> {
    await this.ready();
    const state = this.workflows.get(workflowId);
    return state ? [...state.events, ...(state.result?.timeline ?? [])] : [];
  }

  async reset(workflowId?: string): Promise<void> {
    await this.ready();
    if (workflowId) {
      this.workflows.delete(workflowId);
      for (const [sessionId, mappedWorkflowId] of this.sessionToWorkflow.entries()) {
        if (mappedWorkflowId === workflowId) {
          this.sessionToWorkflow.delete(sessionId);
        }
      }
    } else {
      this.workflows.clear();
      this.sessionToWorkflow.clear();
    }
    await this.persist();
  }
}
