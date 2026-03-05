import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";

import {
  InMemoryReplayGuard,
  WauthSchemaRegistry,
  buildWauthGetFromArtifact,
  buildWauthMetadata,
  buildWauthReqSigForwardingRequest,
  buildBearerDpopAuthorizationHeader,
  computeActionHash,
  computeJwkThumbprint,
  createDpopProof,
  extractArtifactRefs,
  extractElicitations,
  metadataSupportsNamespace,
  metadataSupportsTool,
  parseWauthGetArtifact,
  parseWauthMetadata,
  parseWauthResultEnvelope,
  verifyCapabilityRequestWithDpop,
  type JsonValue,
  type WauthArtifact,
  type WauthMetadataEnvelope,
  type WauthResultEnvelope,
  type WauthToolCall
} from "./sdk.js";

interface DemoClock {
  nowEpochSeconds(): number;
  nowIsoString(): string;
  tick(seconds?: number): number;
}

class IncrementalClock implements DemoClock {
  private currentEpochSeconds: number;

  constructor(startEpochSeconds = 1_700_000_000) {
    this.currentEpochSeconds = startEpochSeconds;
  }

  nowEpochSeconds(): number {
    return this.currentEpochSeconds;
  }

  nowIsoString(): string {
    return new Date(this.currentEpochSeconds * 1000).toISOString();
  }

  tick(seconds = 1): number {
    this.currentEpochSeconds += seconds;
    return this.currentEpochSeconds;
  }
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function asArray(value: JsonValue | undefined): JsonValue[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function getRequiredString(record: Record<string, JsonValue>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing required string field: ${field}`);
  }
  return value;
}

function getFirstAuthDetail(wauthRequired: Record<string, JsonValue>): Record<string, JsonValue> {
  const authorizationDetails = asArray(wauthRequired.authorization_details);
  if (!authorizationDetails || authorizationDetails.length === 0) {
    throw new Error("wauth_required.authorization_details must be a non-empty array");
  }

  const first = asRecord(authorizationDetails[0] as JsonValue);
  if (!first) {
    throw new Error("wauth_required.authorization_details[0] must be an object");
  }

  return first;
}

function readAudienceFromRequirement(detail: Record<string, JsonValue>): string {
  const locations = asArray(detail.locations);
  if (!locations || locations.length === 0 || typeof locations[0] !== "string") {
    throw new Error("wauth_required.authorization_details[0].locations[0] must be a string URI");
  }
  return locations[0] as string;
}

function readActionHashFromRequirement(
  detail: Record<string, JsonValue>,
  actionInstance: Record<string, JsonValue> | undefined
): string {
  if (typeof detail.action_hash === "string") {
    return normalizeActionHash(detail.action_hash);
  }
  if (actionInstance) {
    return computeProtocolActionHash(actionInstance);
  }
  throw new Error("could not determine action_hash from requirement or actionInstance");
}

function normalizeActionHash(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function computeProtocolActionHash(actionInstance: Record<string, JsonValue>): string {
  return normalizeActionHash(computeActionHash(actionInstance));
}

function resolveSchemaDirectory(): string {
  const demoLocal = resolve(fileURLToPath(new URL("..", import.meta.url)), "schemas");
  if (existsSync(demoLocal)) {
    return demoLocal;
  }

  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  return resolve(repoRoot, "schemas");
}

function extractTokenFromArtifact(artifact: WauthArtifact): string {
  if (typeof artifact.inline === "string" && artifact.inline.length > 0) {
    return artifact.inline;
  }

  const inlineRecord = asRecord(artifact.inline);
  if (inlineRecord && typeof inlineRecord.token === "string" && inlineRecord.token.length > 0) {
    return inlineRecord.token;
  }

  throw new Error("artifact did not include inline capability token");
}

export interface DemoTimelineEvent {
  at: string;
  type: string;
  detail: Record<string, JsonValue>;
}

export interface DemoReceipt {
  rp: string;
  accepted_at: string;
  transaction_id: string;
  action_hash: string;
  capability_jti: string;
}

export interface DemoActionInstance {
  profile: string;
  action: string;
  resource: string;
  [key: string]: JsonValue;
}

export interface TaxDemoRunResult {
  ok: boolean;
  metadata: WauthMetadataEnvelope;
  receipts: DemoReceipt[];
  timeline: DemoTimelineEvent[];
}

class WauthToolError extends Error {
  readonly code: number;
  readonly data: Record<string, JsonValue>;

  constructor(code: number, message: string, data: Record<string, JsonValue>) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

class DemoCredentialStore {
  private readonly artifacts = new Map<string, WauthArtifact>();
  private readonly receipts: DemoReceipt[] = [];

  putArtifact(ref: string, artifact: WauthArtifact): void {
    this.artifacts.set(ref, artifact);
  }

  getArtifact(ref: string): WauthArtifact | undefined {
    return this.artifacts.get(ref);
  }

  addReceipt(receipt: DemoReceipt): void {
    this.receipts.push(receipt);
  }

  listReceipts(): DemoReceipt[] {
    return [...this.receipts];
  }
}

class DemoKcs {
  private readonly privateKey: CryptoKey;
  readonly publicJwk: JWK;
  readonly jkt: string;
  private readonly clock: DemoClock;

  private constructor(privateKey: CryptoKey, publicJwk: JWK, jkt: string, clock: DemoClock) {
    this.privateKey = privateKey;
    this.publicJwk = publicJwk;
    this.jkt = jkt;
    this.clock = clock;
  }

  static async create(clock: DemoClock): Promise<DemoKcs> {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.alg = "ES256";
    publicJwk.use = "sig";
    publicJwk.kid = "demo-kcs-es256";
    const jkt = await computeJwkThumbprint(publicJwk);
    return new DemoKcs(privateKey, publicJwk, jkt, clock);
  }

  async createDpopProof(method: string, url: string, accessToken: string, nonce?: string): Promise<string> {
    return createDpopProof({
      privateKey: this.privateKey,
      publicJwk: this.publicJwk,
      htm: method,
      htu: url,
      accessToken,
      nonce,
      iatEpochSeconds: this.clock.nowEpochSeconds()
    });
  }
}

class DemoWas {
  readonly issuer: string;
  readonly publicJwk: JWK;
  readonly jwks: { keys: JWK[] };

  private readonly privateKey: CryptoKey;
  private readonly clock: DemoClock;
  private readonly approvedRequestIds = new Set<string>();
  private readonly resultByRequestId = new Map<string, WauthResultEnvelope>();
  private readonly artifactByRef = new Map<string, WauthArtifact>();

  constructor(options: {
    issuer: string;
    privateKey: CryptoKey;
    publicJwk: JWK;
    clock: DemoClock;
  }) {
    this.issuer = options.issuer;
    this.privateKey = options.privateKey;
    this.publicJwk = options.publicJwk;
    this.jwks = { keys: [options.publicJwk] };
    this.clock = options.clock;
  }

  approveRequest(requestId: string): void {
    this.approvedRequestIds.add(requestId);
  }

  metadata(): WauthMetadataEnvelope {
    return {
      issuer: this.issuer,
      jwks_uri: `${this.issuer}/jwks`,
      wauth_versions_supported: ["0.5.1"],
      intent_versions_supported: ["0.2"],
      profiles_supported: [
        "aaif.wauth.profile.rp-requirements-signaling/v0.1",
        "aaif.wauth.profile.requester-continuity/v0.1"
      ],
      formats_supported: ["jwt"],
      mcp: {
        tool_namespaces_supported: ["aaif.wauth"],
        tools_supported: ["aaif.wauth.request", "aaif.wauth.get", "aaif.wauth.metadata"]
      }
    };
  }

  async request(args: Record<string, JsonValue>): Promise<WauthResultEnvelope> {
    const requestId = getRequiredString(args, "requestId");
    const cached = this.resultByRequestId.get(requestId);
    if (cached) {
      return cached;
    }

    const wauthRequired = asRecord(args.wauthRequired);
    if (!wauthRequired) {
      throw new WauthToolError(-32041, "wauthRequired is required", {
        reason: "missing_wauth_required"
      });
    }

    if (!this.approvedRequestIds.has(requestId)) {
      throw new WauthToolError(-32042, "user interaction required", {
        elicitations: [
          {
            elicitationId: `elicit-${requestId}`,
            mode: "qr",
            message: "Approve WAUTH request on iPhone",
            qrPayload: `wauth://approve?request_id=${encodeURIComponent(requestId)}`
          }
        ]
      });
    }

    const firstDetail = getFirstAuthDetail(wauthRequired);
    const audience = readAudienceFromRequirement(firstDetail);
    const actionInstance = asRecord(args.actionInstance);
    const actionHash = readActionHashFromRequirement(firstDetail, actionInstance);
    const agentIdentity = asRecord(args.agentIdentity);
    const cnfJkt = agentIdentity && typeof agentIdentity.cnf_jkt === "string"
      ? agentIdentity.cnf_jkt
      : undefined;

    const now = this.clock.nowEpochSeconds();
    const jti = `cap-${requestId}`;
    const grant: Record<string, JsonValue> = {
      type: firstDetail.type ?? "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1",
      actions: firstDetail.actions ?? ["execute"],
      locations: [audience],
      action_profile: firstDetail.action_profile ?? (actionInstance?.profile ?? "unknown"),
      hash_alg: "S256",
      action_hash: actionHash,
      envelope: firstDetail.envelope ?? { max_uses: 1 }
    };

    const assuranceRequirement = asRecord(firstDetail.assurance);
    if (assuranceRequirement && typeof assuranceRequirement.min_pohp === "number") {
      grant.assurance = {
        achieved_pohp: assuranceRequirement.min_pohp,
        pp_profile: "happ:eu-wallet-demo",
        approved_at: this.clock.nowIsoString()
      };
    }

    const jwtBuilder = new SignJWT({
      action_hash: actionHash,
      authorization_details: [grant],
      ...(cnfJkt ? { cnf: { jkt: cnfJkt } } : {})
    })
      .setProtectedHeader({
        alg: "RS256",
        typ: "JWT",
        kid: this.publicJwk.kid
      })
      .setIssuer(this.issuer)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .setJti(jti);

    const capabilityToken = await jwtBuilder.sign(this.privateKey);
    const ref = `artifact://cap/${jti}`;
    const storedArtifact: WauthArtifact = {
      kind: "WAUTH-CAP",
      format: "jwt",
      ref,
      inline: capabilityToken
    };
    this.artifactByRef.set(ref, storedArtifact);

    const envelope: WauthResultEnvelope = {
      version: "0.1",
      requestId,
      artifacts: [
        {
          kind: "WAUTH-CAP",
          format: "jwt",
          ref
        }
      ],
      receipts: [
        {
          event_id: `evt-${requestId}`,
          event_type: "wauth.capability.issued",
          request_id: requestId,
          action_hash: actionHash,
          audience,
          issued_at: this.clock.nowIsoString()
        }
      ]
    };

    this.resultByRequestId.set(requestId, envelope);
    return envelope;
  }

  get(ref: string): WauthArtifact {
    const artifact = this.artifactByRef.get(ref);
    if (!artifact) {
      throw new Error(`unknown artifact ref: ${ref}`);
    }
    return artifact;
  }
}

interface RelyingPartyResult {
  ok: boolean;
  status: number;
  wauthRequired?: Record<string, JsonValue>;
  receipt?: DemoReceipt;
  verificationErrors?: string[];
}

class DemoRelyingParty {
  readonly name: string;
  readonly method: string;
  readonly audience: string;

  private readonly issuer: string;
  private readonly jwks: { keys: JWK[] };
  private readonly minPohp: number;
  private readonly clock: DemoClock;
  private readonly schemaRegistry: WauthSchemaRegistry;
  private readonly capabilityReplayGuard: InMemoryReplayGuard;
  private readonly dpopReplayGuard: InMemoryReplayGuard;

  constructor(options: {
    name: string;
    method: string;
    audience: string;
    issuer: string;
    jwks: { keys: JWK[] };
    minPohp: number;
    clock: DemoClock;
    schemaRegistry: WauthSchemaRegistry;
  }) {
    this.name = options.name;
    this.method = options.method.toUpperCase();
    this.audience = options.audience;
    this.issuer = options.issuer;
    this.jwks = options.jwks;
    this.minPohp = options.minPohp;
    this.clock = options.clock;
    this.schemaRegistry = options.schemaRegistry;
    this.capabilityReplayGuard = new InMemoryReplayGuard(() => this.clock.nowEpochSeconds());
    this.dpopReplayGuard = new InMemoryReplayGuard(() => this.clock.nowEpochSeconds());
  }

  private buildWauthRequired(actionInstance: DemoActionInstance): Record<string, JsonValue> {
    const actionHash = computeProtocolActionHash(actionInstance);
    const transactionId = `txn-${this.name.toLowerCase()}-${this.clock.nowEpochSeconds()}`;
    const detail: Record<string, JsonValue> = {
      type: "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1",
      actions: [actionInstance.action],
      locations: [this.audience],
      action_profile: actionInstance.profile,
      hash_alg: "S256",
      action_hash: actionHash,
      envelope: {
        max_uses: 1,
        resource: actionInstance.resource
      }
    };

    if (this.minPohp > 0) {
      detail.assurance = {
        min_pohp: this.minPohp,
        accepted_pp_profiles: ["happ:eu-wallet", "happ:iproov"],
        freshness_seconds: 300
      };
    }

    const wauthRequired: Record<string, JsonValue> = {
      error: "wauth_required",
      error_description: `${this.name} requires WAUTH authorization`,
      transaction_id: transactionId,
      authorization_details: [detail],
      wauth_requirements: {
        authorization_details: [detail],
        satisfy: "all",
        max_capability_ttl_seconds: 300
      },
      wauth_binding: {
        method: "rp_action_hash",
        hash_alg: "S256",
        action_profile: actionInstance.profile,
        action_hash: actionHash,
        challenge_id: `wauth-chal-${transactionId}`,
        nonce: `nonce-${transactionId}`,
        issued_at: this.clock.nowIsoString(),
        expires_at: new Date((this.clock.nowEpochSeconds() + 300) * 1000).toISOString(),
        transaction_id: transactionId
      }
    };

    const schemaValidation = this.schemaRegistry.validateByFileName(
      "wauth-required.v0.2.schema.json",
      wauthRequired
    );
    if (!schemaValidation.ok) {
      throw new Error(`generated wauth_required did not validate: ${schemaValidation.errors.join("; ")}`);
    }

    return wauthRequired;
  }

  async attempt(
    actionInstance: DemoActionInstance,
    auth?: { token: string; dpopProof: string }
  ): Promise<RelyingPartyResult> {
    const wauthRequired = this.buildWauthRequired(actionInstance);

    if (!auth) {
      return {
        ok: false,
        status: 401,
        wauthRequired
      };
    }

    const verification = await verifyCapabilityRequestWithDpop({
      token: auth.token,
      jwks: this.jwks,
      expectedIssuer: this.issuer,
      expectedAudience: this.audience,
      expectedActionHash: computeProtocolActionHash(actionInstance),
      dpopProof: auth.dpopProof,
      requestMethod: this.method,
      requestUrl: this.audience,
      nowEpochSeconds: this.clock.nowEpochSeconds(),
      capabilityReplayGuard: this.capabilityReplayGuard,
      dpopReplayGuard: this.dpopReplayGuard
    });

    if (!verification.ok) {
      return {
        ok: false,
        status: 401,
        wauthRequired,
        verificationErrors: verification.errors
      };
    }

    const receipt: DemoReceipt = {
      rp: this.name,
      accepted_at: this.clock.nowIsoString(),
      transaction_id: getRequiredString(wauthRequired, "transaction_id"),
      action_hash: computeProtocolActionHash(actionInstance),
      capability_jti: verification.replayKey ?? "unknown"
    };

    return {
      ok: true,
      status: 200,
      receipt
    };
  }
}

class DemoWalletMcp {
  private readonly was: DemoWas;

  constructor(was: DemoWas) {
    this.was = was;
  }

  async invoke(call: WauthToolCall): Promise<Record<string, JsonValue>> {
    if (call.name.endsWith(".request")) {
      const result = await this.was.request(call.arguments);
      return { structuredContent: result as unknown as JsonValue };
    }

    if (call.name.endsWith(".get")) {
      const ref = getRequiredString(call.arguments, "ref");
      return { structuredContent: this.was.get(ref) as unknown as JsonValue };
    }

    if (call.name.endsWith(".metadata")) {
      return { structuredContent: this.was.metadata() as unknown as JsonValue };
    }

    throw new Error(`unsupported tool call: ${call.name}`);
  }
}

export interface WauthDemoEnvironmentOptions {
  issuer?: string;
  nowEpochSeconds?: number;
}

export class WauthDemoEnvironment {
  readonly issuer: string;

  private readonly clock: DemoClock;
  private readonly was: DemoWas;
  private readonly wallet: DemoWalletMcp;
  private readonly kcs: DemoKcs;
  private readonly store = new DemoCredentialStore();
  private readonly bankRp: DemoRelyingParty;
  private readonly employerRp: DemoRelyingParty;
  private readonly irsRp: DemoRelyingParty;
  private readonly timeline: DemoTimelineEvent[] = [];

  private constructor(options: {
    issuer: string;
    clock: DemoClock;
    was: DemoWas;
    wallet: DemoWalletMcp;
    kcs: DemoKcs;
    bankRp: DemoRelyingParty;
    employerRp: DemoRelyingParty;
    irsRp: DemoRelyingParty;
  }) {
    this.issuer = options.issuer;
    this.clock = options.clock;
    this.was = options.was;
    this.wallet = options.wallet;
    this.kcs = options.kcs;
    this.bankRp = options.bankRp;
    this.employerRp = options.employerRp;
    this.irsRp = options.irsRp;
  }

  static async create(options?: WauthDemoEnvironmentOptions): Promise<WauthDemoEnvironment> {
    const issuer = options?.issuer ?? "https://wauth.demo.local";
    const clock = new IncrementalClock(options?.nowEpochSeconds ?? 1_700_000_000);

    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "demo-wauth-rs256";
    publicJwk.alg = "RS256";
    publicJwk.use = "sig";

    const was = new DemoWas({
      issuer,
      privateKey,
      publicJwk,
      clock
    });
    const wallet = new DemoWalletMcp(was);
    const kcs = await DemoKcs.create(clock);

    const schemaRegistry = new WauthSchemaRegistry(resolveSchemaDirectory());

    const bankRp = new DemoRelyingParty({
      name: "BankRP",
      method: "GET",
      audience: "https://bank.demo.local/api/statement",
      issuer,
      jwks: was.jwks,
      minPohp: 1,
      clock,
      schemaRegistry
    });

    const employerRp = new DemoRelyingParty({
      name: "EmployerRP",
      method: "GET",
      audience: "https://employer.demo.local/api/income",
      issuer,
      jwks: was.jwks,
      minPohp: 1,
      clock,
      schemaRegistry
    });

    const irsRp = new DemoRelyingParty({
      name: "IRSRP",
      method: "POST",
      audience: "https://irs.demo.local/api/submit",
      issuer,
      jwks: was.jwks,
      minPohp: 2,
      clock,
      schemaRegistry
    });

    return new WauthDemoEnvironment({
      issuer,
      clock,
      was,
      wallet,
      kcs,
      bankRp,
      employerRp,
      irsRp
    });
  }

  private record(type: string, detail: Record<string, JsonValue>): void {
    this.timeline.push({
      at: this.clock.nowIsoString(),
      type,
      detail
    });
  }

  private async runProtectedActionFlow(
    label: string,
    rp: DemoRelyingParty,
    actionInstance: DemoActionInstance,
    requestId: string
  ): Promise<DemoReceipt> {
    this.clock.tick();
    this.record("rp.initial_attempt", {
      rp: label,
      request_id: requestId
    });

    const denied = await rp.attempt(actionInstance);
    if (denied.ok || !denied.wauthRequired) {
      throw new Error(`${label}: expected initial wauth_required denial`);
    }

    const requestCall = buildWauthReqSigForwardingRequest(
      denied.wauthRequired,
      actionInstance,
      { requestId }
    );
    requestCall.arguments.agentIdentity = {
      cnf_jkt: this.kcs.jkt
    };

    let elicitationCount = 0;
    try {
      await this.wallet.invoke(requestCall);
      throw new Error(`${label}: expected elicitation before approval`);
    } catch (error) {
      if (!(error instanceof WauthToolError)) {
        throw error;
      }
      const elicitations = extractElicitations({
        code: error.code,
        data: error.data
      });
      elicitationCount = elicitations.length;
      if (elicitationCount === 0) {
        throw new Error(`${label}: expected at least one elicitation`);
      }
      this.record("wallet.elicitation", {
        rp: label,
        request_id: requestId,
        elicitation_count: elicitations.length
      });
    }

    this.was.approveRequest(requestId);
    this.clock.tick();

    const requestResult = await this.wallet.invoke(requestCall);
    const envelope = parseWauthResultEnvelope(requestResult);
    const refs = extractArtifactRefs(envelope);
    if (refs.length === 0) {
      throw new Error(`${label}: no artifact refs returned by WAS`);
    }

    const firstArtifact = envelope.artifacts?.[0];
    if (!firstArtifact) {
      throw new Error(`${label}: missing first artifact in envelope`);
    }

    const getCall = buildWauthGetFromArtifact(firstArtifact);
    const getResult = await this.wallet.invoke(getCall);
    const artifact = parseWauthGetArtifact(getResult, {
      expectedKind: "WAUTH-CAP",
      expectedFormat: "jwt"
    });

    const capabilityToken = extractTokenFromArtifact(artifact);
    this.store.putArtifact(refs[0], artifact);

    const dpopProof = await this.kcs.createDpopProof(
      rp.method,
      rp.audience,
      capabilityToken
    );

    const authHeader = buildBearerDpopAuthorizationHeader(capabilityToken);
    this.record("rp.retry_attempt", {
      rp: label,
      request_id: requestId,
      authorization_header_prefix: authHeader.split(" ")[0],
      elicitation_count: elicitationCount
    });

    this.clock.tick();
    const accepted = await rp.attempt(actionInstance, {
      token: capabilityToken,
      dpopProof
    });
    if (!accepted.ok || !accepted.receipt) {
      throw new Error(`${label}: expected accepted retry, errors=${(accepted.verificationErrors ?? []).join(",")}`);
    }

    this.store.addReceipt(accepted.receipt);
    this.record("rp.accepted", {
      rp: label,
      request_id: requestId,
      transaction_id: accepted.receipt.transaction_id,
      action_hash: accepted.receipt.action_hash
    });

    return accepted.receipt;
  }

  async runTaxDemoScenario(): Promise<TaxDemoRunResult> {
    this.clock.tick();

    const metadataResult = await this.wallet.invoke(buildWauthMetadata());
    const metadata = parseWauthMetadata(metadataResult);
    if (!metadataSupportsTool(metadata, "aaif.wauth.request")) {
      throw new Error("WAS metadata does not advertise aaif.wauth.request");
    }
    if (!metadataSupportsTool(metadata, "aaif.wauth.get")) {
      throw new Error("WAS metadata does not advertise aaif.wauth.get");
    }
    if (!metadataSupportsNamespace(metadata, "aaif.wauth")) {
      throw new Error("WAS metadata does not advertise aaif.wauth namespace");
    }

    this.record("wallet.metadata_checked", {
      issuer: metadata.issuer,
      jwks_uri: metadata.jwks_uri
    });

    const bankReceipt = await this.runProtectedActionFlow(
      "BankRP",
      this.bankRp,
      {
        profile: "aaif.wauth.action.bank.read_statement/v0.1",
        action: "read_statement",
        resource: "bank:acct:123",
        month: "2026-01"
      },
      "req-bank-1"
    );

    const employerReceipt = await this.runProtectedActionFlow(
      "EmployerRP",
      this.employerRp,
      {
        profile: "aaif.wauth.action.employer.read_income/v0.1",
        action: "read_income",
        resource: "employer:tax-year:2025",
        employee_id: "EMP-001"
      },
      "req-employer-1"
    );

    const irsReceipt = await this.runProtectedActionFlow(
      "IRSRP",
      this.irsRp,
      {
        profile: "aaif.wauth.action.irs.submit_return/v0.1",
        action: "submit_return",
        resource: "irs:return:2025",
        filing_id: "FILING-2025-0001"
      },
      "req-irs-1"
    );

    return {
      ok: true,
      metadata,
      receipts: [bankReceipt, employerReceipt, irsReceipt],
      timeline: [...this.timeline]
    };
  }

  getTimeline(): DemoTimelineEvent[] {
    return [...this.timeline];
  }

  getStoredReceipts(): DemoReceipt[] {
    return this.store.listReceipts();
  }
}

export async function runTaxDemoScenario(options?: WauthDemoEnvironmentOptions): Promise<TaxDemoRunResult> {
  const env = await WauthDemoEnvironment.create(options);
  return env.runTaxDemoScenario();
}
