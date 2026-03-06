import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { JsonValue } from "./sdk.js";

const URL_ELICITATION_REQUIRED = -32042;
const DEFAULT_HAPP_PORT = Number(process.env.WAUTH_DEMO_HAPP_PORT ?? "8787");
const DEFAULT_HAPP_ISSUER = process.env.WAUTH_DEMO_HAPP_ISSUER ?? "did:web:pp.local";
const DEFAULT_HAPP_RUST_DIR = fileURLToPath(
  new URL("../../../../AAIF/HAPP/implementations/rust", import.meta.url)
);
const DEFAULT_HAPP_TS_SDK_ENTRY = fileURLToPath(
  new URL("../../../../AAIF/HAPP/sdks/typescript/src/index.ts", import.meta.url)
);

export type HappSessionStatus = "pending" | "approved" | "denied" | "unknown";

export interface HappConsentCredentialEnvelope {
  format: string;
  credential: string;
  claims: Record<string, JsonValue>;
}

export interface HappPendingSession {
  mode: "local-ref";
  requestId: string;
  sessionId: string;
  sessionUrl: string;
  sessionApiUrl: string;
  actionIntent: Record<string, JsonValue>;
  requirements: Record<string, JsonValue>;
  status: HappSessionStatus;
  createdAt: string;
  updatedAt: string;
  credential?: HappConsentCredentialEnvelope;
}

export interface HappApprovalRequest {
  requestId: string;
  actionIntent: Record<string, JsonValue>;
  requirements: Record<string, JsonValue>;
}

interface HappRpcErrorData {
  elicitations?: Array<{
    mode?: string;
    url?: string;
  }>;
}

class HappRpcError extends Error {
  readonly code: number;
  readonly data: HappRpcErrorData | undefined;

  constructor(code: number, message: string, data?: HappRpcErrorData) {
    super(message);
    this.name = "HappRpcError";
    this.code = code;
    this.data = data;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asJsonRecord(value: unknown): Record<string, JsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeSessionStatus(value: unknown): HappSessionStatus {
  if (typeof value !== "string") {
    return "unknown";
  }

  switch (value.toLowerCase()) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "denied":
      return "denied";
    default:
      return "unknown";
  }
}

function parseCredentialEnvelope(value: unknown): HappConsentCredentialEnvelope {
  const record = asJsonRecord(value);
  if (!record) {
    throw new Error("HAPP credential envelope missing structured content");
  }

  if (typeof record.format !== "string" || typeof record.credential !== "string") {
    throw new Error("HAPP credential envelope missing format or credential");
  }

  const claims = asJsonRecord(record.claims);
  if (!claims) {
    throw new Error("HAPP credential envelope missing claims");
  }

  return {
    format: record.format,
    credential: record.credential,
    claims
  };
}

function parseSessionId(sessionUrl: string): string {
  const parsed = new URL(sessionUrl);
  const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
  const sessionId = parts.at(-1);
  if (!sessionId) {
    throw new Error(`invalid HAPP session URL: ${sessionUrl}`);
  }
  return sessionId;
}

export function localHappRefAvailable(): boolean {
  return existsSync(DEFAULT_HAPP_RUST_DIR) && existsSync(DEFAULT_HAPP_TS_SDK_ENTRY);
}

export function buildHappSessionApiUrl(sessionUrl: string): string {
  const parsed = new URL(sessionUrl);
  const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
  if (parts.length < 2 || parts[0] !== "session") {
    throw new Error(`unsupported HAPP session URL: ${sessionUrl}`);
  }
  parsed.pathname = `/api/session/${parts[1]}`;
  parsed.search = "";
  return parsed.toString();
}

interface HappVerificationSdk {
  verifyClaims(
    claims: Record<string, unknown>,
    actionIntent: Record<string, unknown>,
    options: {
      expectedAud: string;
      nowEpochSeconds?: number;
      minPoHpLevel?: string;
      identityRequired?: boolean;
      allowedIdentitySchemes?: string[];
    }
  ): unknown;
}

let happSdkPromise: Promise<HappVerificationSdk> | undefined;

async function loadHappVerificationSdk(): Promise<HappVerificationSdk> {
  if (!happSdkPromise) {
    if (!existsSync(DEFAULT_HAPP_TS_SDK_ENTRY)) {
      throw new Error(`HAPP TypeScript SDK not found at ${DEFAULT_HAPP_TS_SDK_ENTRY}`);
    }
    happSdkPromise = import(pathToFileURL(DEFAULT_HAPP_TS_SDK_ENTRY).href) as Promise<HappVerificationSdk>;
  }
  return happSdkPromise;
}

function readMinPoHpLevel(requirements: Record<string, JsonValue>): string | undefined {
  const pohp = asJsonRecord(requirements.pohp);
  return typeof pohp?.minLevel === "string" ? pohp.minLevel : undefined;
}

function readIdentityOptions(requirements: Record<string, JsonValue>): {
  identityRequired: boolean;
  allowedIdentitySchemes?: string[];
} {
  const identity = asJsonRecord(requirements.identity);
  const mode = typeof identity?.mode === "string" ? identity.mode : "none";
  const schemes = asStringArray(identity?.schemes);
  return {
    identityRequired: mode === "required",
    allowedIdentitySchemes: schemes.length > 0 ? schemes : undefined
  };
}

export async function verifyHappEnvelope(options: {
  envelope: HappConsentCredentialEnvelope;
  actionIntent: Record<string, JsonValue>;
  requirements: Record<string, JsonValue>;
  expectedAudience: string;
}): Promise<void> {
  const sdk = await loadHappVerificationSdk();
  const { identityRequired, allowedIdentitySchemes } = readIdentityOptions(options.requirements);
  sdk.verifyClaims(options.envelope.claims, options.actionIntent, {
    expectedAud: options.expectedAudience,
    nowEpochSeconds: Math.floor(Date.now() / 1000),
    minPoHpLevel: readMinPoHpLevel(options.requirements),
    identityRequired,
    allowedIdentitySchemes
  });
}

export interface HappSessionSnapshot {
  status: HappSessionStatus;
  issued?: HappConsentCredentialEnvelope;
}

export type HappRequestResult =
  | {
      status: "pending";
      session: HappPendingSession;
    }
  | {
      status: "approved";
      credential: HappConsentCredentialEnvelope;
    };

export interface HappLocalRefClientOptions {
  port?: number;
  issuer?: string;
  rustDir?: string;
}

export class HappLocalRefClient {
  readonly webBaseUrl: string;

  private readonly issuer: string;
  private readonly rustDir: string;
  private readonly port: number;
  private process?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private startPromise?: Promise<void>;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(options: HappLocalRefClientOptions = {}) {
    this.port = options.port ?? DEFAULT_HAPP_PORT;
    this.issuer = options.issuer ?? DEFAULT_HAPP_ISSUER;
    this.rustDir = options.rustDir ?? DEFAULT_HAPP_RUST_DIR;
    this.webBaseUrl = `http://127.0.0.1:${this.port}`;
  }

  private async waitForWebReady(): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`${this.webBaseUrl}/`);
        if (response.ok) {
          return;
        }
      } catch {
        // Process is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`timed out waiting for HAPP web UI at ${this.webBaseUrl}`);
  }

  private handleStdoutLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    const record = asRecord(parsed);
    if (!record) {
      return;
    }

    const id = typeof record.id === "number" ? record.id : undefined;
    if (typeof id !== "number") {
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);

    const error = asRecord(record.error);
    if (error) {
      pending.reject(
        new HappRpcError(
          typeof error.code === "number" ? error.code : -32000,
          typeof error.message === "string" ? error.message : "HAPP RPC error",
          asRecord(error.data) as HappRpcErrorData | undefined
        )
      );
      return;
    }

    pending.resolve(record.result);
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      pending.reject(error);
    }
  }

  private async start(): Promise<void> {
    if (!existsSync(this.rustDir)) {
      throw new Error(`local HAPP Rust implementation not found at ${this.rustDir}`);
    }

    this.process = spawn(
      "cargo",
      [
        "run",
        "-q",
        "-p",
        "happd",
        "--",
        "--web-addr",
        `127.0.0.1:${this.port}`,
        "--web-base-url",
        this.webBaseUrl,
        "--issuer",
        this.issuer
      ],
      {
        cwd: this.rustDir,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    const stdout = createInterface({ input: this.process.stdout });
    stdout.on("line", (line) => {
      this.handleStdoutLine(line);
    });

    const stderr = createInterface({ input: this.process.stderr });
    stderr.on("line", () => {
      // The HAPP sidecar logs readiness and adapter warnings here. Keep it quiet by default.
    });

    this.process.on("exit", (code, signal) => {
      this.process = undefined;
      this.startPromise = undefined;
      this.rejectPending(
        new Error(`HAPP sidecar exited before response (code=${code ?? "null"}, signal=${signal ?? "null"})`)
      );
    });

    await this.waitForWebReady();
  }

  async ensureStarted(): Promise<void> {
    if (this.process) {
      return;
    }
    if (!this.startPromise) {
      this.startPromise = this.start();
    }
    await this.startPromise;
  }

  private async callTool(name: string, args: Record<string, JsonValue>): Promise<unknown> {
    await this.ensureStarted();
    if (!this.process) {
      throw new Error("HAPP sidecar is not running");
    }

    const id = this.nextId;
    this.nextId += 1;

    const payload = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
    };

    const response = await new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process!.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });

    return response;
  }

  async requestApproval(input: HappApprovalRequest): Promise<HappRequestResult> {
    try {
      const result = await this.callTool("aaif.happ.request", {
        requestId: input.requestId,
        actionIntent: input.actionIntent,
        requirements: input.requirements
      });
      const resultRecord = asRecord(result);
      return {
        status: "approved",
        credential: parseCredentialEnvelope(resultRecord?.structuredContent)
      };
    } catch (error) {
      if (error instanceof HappRpcError && error.code === URL_ELICITATION_REQUIRED) {
        const elicitation = error.data?.elicitations?.find((item) => item.mode === "url" && typeof item.url === "string");
        if (!elicitation?.url) {
          throw new Error("HAPP approval requested interaction but did not return a session URL");
        }

        const sessionUrl = elicitation.url;
        const createdAt = nowIso();
        return {
          status: "pending",
          session: {
            mode: "local-ref",
            requestId: input.requestId,
            sessionId: parseSessionId(sessionUrl),
            sessionUrl,
            sessionApiUrl: buildHappSessionApiUrl(sessionUrl),
            actionIntent: input.actionIntent,
            requirements: input.requirements,
            status: "pending",
            createdAt,
            updatedAt: createdAt
          }
        };
      }
      throw error;
    }
  }

  async getSessionSnapshot(sessionId: string): Promise<HappSessionSnapshot> {
    await this.ensureStarted();
    const response = await fetch(`${this.webBaseUrl}/api/session/${encodeURIComponent(sessionId)}`);
    if (response.status === 404) {
      return { status: "unknown" };
    }
    if (!response.ok) {
      throw new Error(`failed to fetch HAPP session ${sessionId}: ${response.status}`);
    }

    const payload = asRecord(await response.json());
    const session = asRecord(payload?.session);
    return {
      status: normalizeSessionStatus(session?.status),
      issued: payload?.issued ? parseCredentialEnvelope(payload.issued) : undefined
    };
  }
}
