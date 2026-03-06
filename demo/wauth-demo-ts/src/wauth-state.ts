import { createPrivateKey, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { SignJWT, type JWTPayload } from "jose";

import type { HappConsentCredentialEnvelope, HappPendingSession } from "./happ-local-ref.js";
import { computeActionHash, type JsonValue, type WauthArtifact, type WauthResultEnvelope } from "./sdk.js";

const DEFAULT_DATA_FILE = resolve(process.cwd(), ".wauth-demo", "wauth-state.json");
const DEFAULT_APPROVAL_BASE_URL = "https://iproov.demo.local/approve";
const DEFAULT_SUBJECT = "did:example:user:demo";
const SIGNING_KID = "wauth-demo-rs256";

const SIGNING_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCFRxawDOP0eUcy
SVg3l429695LDJx1EKWU9jYKyXxOeo+/72MJezKmmHe3Pzje69qZEtZ3246QbThW
q6HBc/C1cFkvHJ1cahxRwHVfPXoMspWi3c7s/bDw99vmzGAAUjYDe3IxXhXtY186
Moangq6d65EN2BzXQG/khdOM7T2TMJLfP+vZtpGpYNPZhNwpRudJvvSR93XRhL4i
PRj3pAqtri0f4Lit1w5nEYNnCSF7i64h5KuIi9ANUtukJZJA8iPaOfBUIdzMnMhH
xEkAtlS5LK+EuJjx/dWCWK66caN3SEmWBgnet5RS2muJNwBdjh8K6/koH93xPi7t
aVqlM29jAgMBAAECggEALbRnvN7my39NoZqSZJoV8xPwiucbvm+DgRaACOn4tYcF
RepnmahEgeoWX+KP866JK+ZQYxEJjlDOObapBYjneqk5BFV5R2hiJszr00nnUXRq
qUwMeqwzIie1oyviHioTONV8Hx7nQR3LWc9a6xX/IMvYVhmPJmgEFyenmRQAgjlu
6y4A1W3AyHXoSJe9vxakInE8SlyYAaYSnlIb7k7aYQXad9/0NyEDcCviUx+HjtaR
qDMmnB/BJGcB0oFMdCcEE6Cvk8ynsrU8ic5dpqz0y/xgn2wKapLd5RdbkvJ0mPGK
cGDemA1N8f+SQISIaAYNwwzYSxFE4eIUoPy8vlihbQKBgQC6Ni7Au6X6Llwzz5a9
xQGNouYV6AjZyFEQpcg6XtlQlV5h4aSRAuxJU/kZXrHc9Lv08RGveQb1Bu89hGiV
6gyh6UO8hoHFuH/aMhVJwByb4x4SLEnMlnAPsAFpd0B1S5s29ATptkfUY4ndvTa8
0AQB8hg21xA4gk6x8OZGMg3kdQKBgQC3OjsaZBgBMHseo/0pda1Zr1oN+sdevt78
IPDvG8x0yLd0eNFzoCCit9ov2U92hwyW75SbDe0CTFrPY3i4xrDVnZiTAy/6MvQ7
5lJ7fuxj5vQEIa/y+24lmFNDzQ2inPGIOzBEK6Zcx/iWIkPhPrMGl+9E86U3yOwf
RMsMn5mpdwKBgFLF+wpZX3JSYVH2mP9KL2KSYsyiFC0ayk4oI1UvDFKx0v6XmtuK
/RWrajNI0K9zaol7D2180wbgSkCCNytMmsjuM9n9wHnvhYWsdaIO76ir0JYrcbKr
vKx8hGQpSlHZhelrlzN8f3l9ta8HiOltXhqvTuwxtVgpNGoMt4/EeEBxAoGAD6MH
kjwClG9nwniqTVR+o83EOLczNpHBg/DnvvA3ZawPhAAfl+eNgXWBSF4aWvoxh9wQ
aZ8pn+2WPma10ccbJk/ZyooWGRsqHsaMOX/eerQmFQgu9OSiRNEYIgwo4rzUHBU5
DEhRXU+vllh8RIfOTXy/7bmBWx5pkE2VqpEgUwcCgYBgh2j5DB94pm9kgH8Mqz04
36W7NVpjqT0DZrS6EmYvx0hyjclIL+gYvEMpOOOeH0bK6QieZ4lEFAkV4poGz/Y/
N/krUAe1w63HWnwoIG6VWNqK77iem6g/j4YVwI8knj730qChrBqw5aAM5r9mjV/x
wI4lKRQAb/06ouNhRyw4KQ==
-----END PRIVATE KEY-----`;

const SIGNING_PUBLIC_JWK = {
  kty: "RSA",
  n: "hUcWsAzj9HlHMklYN5eNveveSwycdRCllPY2Csl8TnqPv-9jCXsypph3tz843uvamRLWd9uOkG04VquhwXPwtXBZLxydXGocUcB1Xz16DLKVot3O7P2w8Pfb5sxgAFI2A3tyMV4V7WNfOjKGp4KuneuRDdgc10Bv5IXTjO09kzCS3z_r2baRqWDT2YTcKUbnSb70kfd10YS-Ij0Y96QKra4tH-C4rdcOZxGDZwkhe4uuIeSriIvQDVLbpCWSQPIj2jnwVCHczJzIR8RJALZUuSyvhLiY8f3VgliuunGjd0hJlgYJ3reUUtpriTcAXY4fCuv5KB_d8T4u7WlapTNvYw",
  e: "AQAB",
  alg: "RS256",
  use: "sig",
  kid: SIGNING_KID
};

function nowIso(): string {
  return new Date().toISOString();
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveAudience(wauthRequired: Record<string, JsonValue>): string {
  const firstDetail = extractFirstAuthorizationDetail(wauthRequired);
  const locations = Array.isArray(firstDetail?.locations) ? firstDetail.locations : [];
  const firstLocation = locations[0];
  if (typeof firstLocation === "string" && firstLocation.length > 0) {
    return firstLocation;
  }
  return "https://rp.demo.local/action";
}

function extractFirstAuthorizationDetail(
  wauthRequired: Record<string, JsonValue>
): Record<string, JsonValue> | undefined {
  const authorizationDetails = wauthRequired.authorization_details;
  if (!Array.isArray(authorizationDetails) || authorizationDetails.length === 0) {
    return undefined;
  }

  return asRecord(authorizationDetails[0]);
}

function resolveActionHash(
  wauthRequired: Record<string, JsonValue>,
  actionInstance: JsonValue | undefined
): string {
  const firstDetail = extractFirstAuthorizationDetail(wauthRequired);
  if (firstDetail && typeof firstDetail.action_hash === "string") {
    return firstDetail.action_hash;
  }

  const actionRecord = asRecord(actionInstance);
  if (actionRecord) {
    return computeActionHash(actionRecord);
  }

  return computeActionHash({
    profile: "aaif.wauth.action.demo/default",
    action: "execute",
    resource: "demo:wauth:resource"
  });
}

function resolveCnfJkt(agentIdentity: Record<string, JsonValue> | undefined): string | undefined {
  const value = agentIdentity?.cnf_jkt;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface WauthPendingApproval {
  approvalId: string;
  requestId: string;
  message: string;
  approvalUrl: string;
  createdAt: string;
  happ?: HappPendingSession;
}

export interface WauthRequestState {
  requestId: string;
  createdAt: string;
  updatedAt: string;
  status: "pending_approval" | "issued";
  wauthRequired: Record<string, JsonValue>;
  actionInstance?: JsonValue;
  agentIdentity?: Record<string, JsonValue>;
  pendingApproval?: WauthPendingApproval;
  happCredential?: HappConsentCredentialEnvelope;
  artifactRef: string;
  envelope?: WauthResultEnvelope;
  artifact?: WauthArtifact;
}

export interface WauthRequestResult {
  requestId: string;
  state: WauthRequestState;
  pendingApproval?: WauthPendingApproval;
  envelope?: WauthResultEnvelope;
}

interface PersistedData {
  requests: Record<string, WauthRequestState>;
  sessionToRequest: Record<string, string>;
}

export interface WauthRequestServiceOptions {
  issuer: string;
  dataFilePath?: string;
  approvalBaseUrl?: string;
}

export class WauthRequestService {
  private readonly issuer: string;
  private readonly dataFilePath: string;
  private readonly approvalBaseUrl: string;
  private readonly requests = new Map<string, WauthRequestState>();
  private readonly sessionToRequest = new Map<string, string>();
  private readonly signingKey = createPrivateKey(SIGNING_PRIVATE_KEY_PEM);
  private readonly publicJwk = cloneValue(SIGNING_PUBLIC_JWK);
  private loadPromise: Promise<void>;

  constructor(options: WauthRequestServiceOptions) {
    this.issuer = options.issuer;
    this.dataFilePath = options.dataFilePath ?? DEFAULT_DATA_FILE;
    this.approvalBaseUrl = options.approvalBaseUrl ?? DEFAULT_APPROVAL_BASE_URL;
    this.loadPromise = this.load();
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.dataFilePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedData;
      for (const [requestId, state] of Object.entries(parsed.requests ?? {})) {
        this.requests.set(requestId, state);
      }
      for (const [sessionId, requestId] of Object.entries(parsed.sessionToRequest ?? {})) {
        this.sessionToRequest.set(sessionId, requestId);
      }
    } catch {
      // No prior persisted state on first run.
    }
  }

  private async persist(): Promise<void> {
    const payload: PersistedData = {
      requests: Object.fromEntries(this.requests.entries()),
      sessionToRequest: Object.fromEntries(this.sessionToRequest.entries())
    };
    await mkdir(dirname(this.dataFilePath), { recursive: true });
    await writeFile(this.dataFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private async ready(): Promise<void> {
    await this.loadPromise;
  }

  private resolveRequestId(
    sessionId: string | undefined,
    requestedRequestId?: string,
    createIfMissing = true
  ): string | undefined {
    if (requestedRequestId && requestedRequestId.length > 0) {
      if (sessionId) {
        this.sessionToRequest.set(sessionId, requestedRequestId);
      }
      return requestedRequestId;
    }

    if (sessionId) {
      const existing = this.sessionToRequest.get(sessionId);
      if (existing) {
        return existing;
      }
      if (!createIfMissing) {
        return undefined;
      }
      const generated = `req_${randomUUID()}`;
      this.sessionToRequest.set(sessionId, generated);
      return generated;
    }

    if (!createIfMissing) {
      return undefined;
    }
    return `req_${randomUUID()}`;
  }

  private approvalUrl(requestId: string, approvalId: string): string {
    const baseUrl = trimTrailingSlash(this.approvalBaseUrl);
    return `${baseUrl}?request_id=${encodeURIComponent(requestId)}&approval_id=${encodeURIComponent(approvalId)}`;
  }

  private findRequestStateByApprovalId(approvalId: string): WauthRequestState {
    for (const state of this.requests.values()) {
      if (state.pendingApproval?.approvalId === approvalId) {
        return state;
      }
    }
    throw new Error(`approval ${approvalId} is not pending`);
  }

  private async issueCapability(state: WauthRequestState): Promise<void> {
    if (state.envelope && state.artifact) {
      return;
    }

    const issuedAt = nowEpochSeconds();
    const firstDetail = extractFirstAuthorizationDetail(state.wauthRequired);
    const actionHash = resolveActionHash(state.wauthRequired, state.actionInstance);
    const claims: JWTPayload = {
      iss: this.issuer,
      sub: DEFAULT_SUBJECT,
      aud: resolveAudience(state.wauthRequired),
      iat: issuedAt,
      exp: issuedAt + 600,
      jti: `cap-${state.requestId}`,
      action_hash: actionHash,
      authorization_details: firstDetail ? [cloneValue(firstDetail)] : []
    } as JWTPayload;

    const cnfJkt = resolveCnfJkt(state.agentIdentity);
    if (cnfJkt) {
      claims.cnf = { jkt: cnfJkt };
    }

    const token = await new SignJWT(claims)
      .setProtectedHeader({
        alg: "RS256",
        kid: SIGNING_KID,
        typ: "JWT"
      })
      .sign(this.signingKey);

    const artifact: WauthArtifact = {
      kind: "WAUTH-CAP",
      format: "jwt",
      ref: state.artifactRef,
      inline: {
        token
      }
    };

    state.artifact = artifact;
    state.envelope = {
      version: "0.5.1",
      requestId: state.requestId,
      artifacts: [
        {
          kind: "WAUTH-CAP",
          format: "jwt",
          ref: state.artifactRef
        }
      ],
      meta: {
        issuer: this.issuer
      }
    };
  }

  async request(
    sessionId: string | undefined,
    args: {
      requestId?: string;
      wauthRequired: Record<string, JsonValue>;
      actionInstance?: JsonValue;
      agentIdentity?: Record<string, JsonValue>;
    }
  ): Promise<WauthRequestResult> {
    await this.ready();
    const requestId = this.resolveRequestId(sessionId, args.requestId, true);
    if (!requestId) {
      throw new Error("failed to resolve request id");
    }

    const existing = this.requests.get(requestId);
    if (existing) {
      if (existing.status === "pending_approval" && existing.pendingApproval) {
        return {
          requestId,
          state: cloneValue(existing),
          pendingApproval: cloneValue(existing.pendingApproval)
        };
      }
      return {
        requestId,
        state: cloneValue(existing),
        envelope: cloneValue(existing.envelope)
      };
    }

    const approvalId = `approve_wauth_${randomUUID()}`;
    const state: WauthRequestState = {
      requestId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: "pending_approval",
      wauthRequired: cloneValue(args.wauthRequired),
      actionInstance: typeof args.actionInstance === "undefined" ? undefined : cloneValue(args.actionInstance),
      agentIdentity: args.agentIdentity ? cloneValue(args.agentIdentity) : undefined,
      artifactRef: `artifact://wauth-cap/${requestId}`,
      pendingApproval: {
        approvalId,
        requestId,
        message: "Approval needed to continue. Please verify your identity to issue your WAUTH capability.",
        approvalUrl: this.approvalUrl(requestId, approvalId),
        createdAt: nowIso()
      }
    };
    this.requests.set(requestId, state);
    await this.persist();

    return {
      requestId,
      state: cloneValue(state),
      pendingApproval: cloneValue(state.pendingApproval)
    };
  }

  async approveByApprovalId(approvalId: string): Promise<WauthRequestResult> {
    await this.ready();
    const state = this.findRequestStateByApprovalId(approvalId);
    await this.issueCapability(state);
    state.pendingApproval = undefined;
    state.status = "issued";
    state.updatedAt = nowIso();
    await this.persist();
    return {
      requestId: state.requestId,
      state: cloneValue(state),
      envelope: cloneValue(state.envelope)
    };
  }

  async findPendingApprovalById(approvalId: string): Promise<WauthPendingApproval | undefined> {
    await this.ready();
    for (const state of this.requests.values()) {
      if (state.pendingApproval?.approvalId === approvalId) {
        return cloneValue(state.pendingApproval);
      }
    }
    return undefined;
  }

  async attachHappSession(approvalId: string, happ: HappPendingSession): Promise<WauthPendingApproval> {
    await this.ready();
    const state = this.findRequestStateByApprovalId(approvalId);
    if (!state.pendingApproval) {
      throw new Error(`approval ${approvalId} is no longer pending`);
    }

    state.pendingApproval.happ = cloneValue(happ);
    state.updatedAt = nowIso();
    await this.persist();
    return cloneValue(state.pendingApproval);
  }

  async recordHappCredential(
    approvalId: string,
    credential: HappConsentCredentialEnvelope
  ): Promise<WauthPendingApproval> {
    await this.ready();
    const state = this.findRequestStateByApprovalId(approvalId);
    if (!state.pendingApproval?.happ) {
      throw new Error(`approval ${approvalId} has no HAPP session`);
    }

    state.pendingApproval.happ = {
      ...state.pendingApproval.happ,
      status: "approved",
      credential: cloneValue(credential),
      updatedAt: nowIso()
    };
    state.happCredential = cloneValue(credential);
    state.updatedAt = nowIso();
    await this.persist();
    return cloneValue(state.pendingApproval);
  }

  async getRequestState(requestId: string): Promise<WauthRequestState | undefined> {
    await this.ready();
    const state = this.requests.get(requestId);
    return state ? cloneValue(state) : undefined;
  }

  async getArtifact(ref: string): Promise<WauthArtifact> {
    await this.ready();
    for (const state of this.requests.values()) {
      if (state.artifactRef === ref && state.artifact) {
        return cloneValue(state.artifact);
      }
    }
    throw new Error(`unknown artifact ref: ${ref}`);
  }

  async metadata(): Promise<Record<string, JsonValue>> {
    await this.ready();
    return {
      issuer: this.issuer,
      jwks_uri: `${trimTrailingSlash(this.issuer)}/jwks`,
      wauth_versions_supported: ["0.5.1"],
      intent_versions_supported: ["0.2"],
      profiles_supported: [
        "aaif.wauth.profile.rp-requirements-signaling/v0.1",
        "aaif.wauth.profile.requester-continuity/v0.1"
      ],
      formats_supported: ["jwt"],
      mcp: {
        tool_namespaces_supported: ["aaif.wauth", "aaif.demo"],
        tools_supported: [
          "aaif.wauth.request",
          "aaif.wauth.get",
          "aaif.wauth.metadata",
          "aaif.demo.tax.file",
          "aaif.demo.tax.status",
          "aaif.demo.tax.approve",
          "aaif.demo.tax.pending_approvals",
          "aaif.demo.tax.timeline",
          "aaif.demo.tax.reset"
        ]
      }
    };
  }

  async jwks(): Promise<Record<string, JsonValue>> {
    await this.ready();
    return {
      keys: [cloneValue(this.publicJwk) as unknown as Record<string, JsonValue>]
    };
  }

  async reset(requestId?: string): Promise<void> {
    await this.ready();
    if (requestId) {
      this.requests.delete(requestId);
      for (const [sessionId, mappedRequestId] of this.sessionToRequest.entries()) {
        if (mappedRequestId === requestId) {
          this.sessionToRequest.delete(sessionId);
        }
      }
    } else {
      this.requests.clear();
      this.sessionToRequest.clear();
    }
    await this.persist();
  }
}
