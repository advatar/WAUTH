import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  InMemoryReplayGuard,
  WauthSchemaRegistry,
  computeActionHash,
  verifyCapabilityRequestWithDpop,
  type JsonValue
} from "./sdk.js";
import type { DemoActionInstance, DemoReceipt } from "./engine.js";

export type MockRpSlug = "bank" | "hr" | "tax-office";

export interface MockRpVerificationResult {
  ok: boolean;
  status: number;
  wauthRequired?: Record<string, JsonValue>;
  receipt?: DemoReceipt;
  data?: Record<string, JsonValue>;
  verificationErrors?: string[];
}

interface MockRpDefinition {
  slug: MockRpSlug;
  name: string;
  method: "GET" | "POST";
  actionProfile: string;
  actionName: string;
  actionSuffix: string;
  minPohp: number;
  landingPaths: string[];
  buildActionInstance(input: Record<string, string | undefined>): DemoActionInstance;
  buildData(actionInstance: DemoActionInstance): Record<string, JsonValue>;
}

interface Clock {
  nowEpochSeconds(): number;
  nowIsoString(): string;
}

class SystemClock implements Clock {
  nowEpochSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  nowIsoString(): string {
    return new Date().toISOString();
  }
}

const MOCK_RP_DEFINITIONS: readonly MockRpDefinition[] = [
  {
    slug: "bank",
    name: "BankRP",
    method: "GET",
    actionProfile: "aaif.wauth.action.bank.read_statement/v0.1",
    actionName: "read_statement",
    actionSuffix: "/api/statement",
    minPohp: 1,
    landingPaths: ["/bank", "/api/bank"],
    buildActionInstance(input) {
      const accountId = input.account_id ?? "1234";
      const month = input.month ?? "2026-01";
      return {
        profile: "aaif.wauth.action.bank.read_statement/v0.1",
        action: "read_statement",
        resource: `bank:acct:${accountId}`,
        account_id: accountId,
        month
      };
    },
    buildData(actionInstance) {
      return {
        account_id: actionInstance.account_id ?? "1234",
        month: actionInstance.month ?? "2026-01",
        statement_id: `stmt-${String(actionInstance.month ?? "2026-01")}-${String(actionInstance.account_id ?? "1234")}`,
        currency: "USD",
        ending_balance: "12450.32"
      };
    }
  },
  {
    slug: "hr",
    name: "EmployerRP",
    method: "GET",
    actionProfile: "aaif.wauth.action.employer.read_income/v0.1",
    actionName: "read_income",
    actionSuffix: "/api/income",
    minPohp: 1,
    landingPaths: ["/hr", "/employer", "/api/hr", "/api/employer"],
    buildActionInstance(input) {
      const employeeId = input.employee_id ?? "EMP-001";
      const taxYear = input.tax_year ?? "2025";
      return {
        profile: "aaif.wauth.action.employer.read_income/v0.1",
        action: "read_income",
        resource: `employer:tax-year:${taxYear}`,
        employee_id: employeeId,
        tax_year: taxYear
      };
    },
    buildData(actionInstance) {
      return {
        employee_id: actionInstance.employee_id ?? "EMP-001",
        tax_year: actionInstance.tax_year ?? "2025",
        employer: "Juniper Systems",
        gross_income: "143000.00",
        record_status: "released"
      };
    }
  },
  {
    slug: "tax-office",
    name: "IRSRP",
    method: "POST",
    actionProfile: "aaif.wauth.action.irs.submit_return/v0.1",
    actionName: "submit_return",
    actionSuffix: "/api/submit",
    minPohp: 2,
    landingPaths: ["/tax-office", "/irs", "/api/tax-office", "/api/irs"],
    buildActionInstance(input) {
      const filingId = input.filing_id ?? "FILING-2025-0001";
      const taxYear = input.tax_year ?? "2025";
      return {
        profile: "aaif.wauth.action.irs.submit_return/v0.1",
        action: "submit_return",
        resource: `irs:return:${taxYear}`,
        filing_id: filingId,
        tax_year: taxYear
      };
    },
    buildData(actionInstance) {
      return {
        filing_id: actionInstance.filing_id ?? "FILING-2025-0001",
        tax_year: actionInstance.tax_year ?? "2025",
        submission_status: "accepted",
        confirmation_code: `CONF-${String(actionInstance.filing_id ?? "FILING-2025-0001")}`
      };
    }
  }
] as const;

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function absoluteUrl(origin: string, pathname: string): string {
  return new URL(pathname, `${trimTrailingSlash(origin)}/`).toString();
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
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

function normalizeActionHash(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function computeProtocolActionHash(actionInstance: DemoActionInstance): string {
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

function definitionForLandingPath(pathname: string): MockRpDefinition | undefined {
  const normalized = normalizePath(pathname);
  return MOCK_RP_DEFINITIONS.find((definition) => definition.landingPaths.includes(normalized));
}

function definitionForActionPath(pathname: string): MockRpDefinition | undefined {
  const normalized = normalizePath(pathname);
  return MOCK_RP_DEFINITIONS.find((definition) =>
    definition.landingPaths.some((landingPath) => `${landingPath}${definition.actionSuffix}` === normalized)
  );
}

function definitionForPath(pathname: string): MockRpDefinition | undefined {
  return definitionForLandingPath(pathname) ?? definitionForActionPath(pathname);
}

function buildWauthRequired(
  definition: MockRpDefinition,
  audience: string,
  actionInstance: DemoActionInstance,
  clock: Clock,
  schemaRegistry: WauthSchemaRegistry
): Record<string, JsonValue> {
  const actionHash = computeProtocolActionHash(actionInstance);
  const transactionId = `txn-${definition.name.toLowerCase()}-${clock.nowEpochSeconds()}`;
  const detail: Record<string, JsonValue> = {
    type: "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1",
    actions: [definition.actionName],
    locations: [audience],
    action_profile: definition.actionProfile,
    hash_alg: "S256",
    action_hash: actionHash,
    envelope: {
      max_uses: 1,
      resource: actionInstance.resource
    }
  };

  if (definition.minPohp > 0) {
    detail.assurance = {
      min_pohp: definition.minPohp,
      accepted_pp_profiles: ["happ:eu-wallet", "happ:iproov"],
      freshness_seconds: 300
    };
  }

  const wauthRequired: Record<string, JsonValue> = {
    error: "wauth_required",
    error_description: `${definition.name} requires WAUTH authorization`,
    transaction_id: transactionId,
    authorization_details: [detail],
    wauth_requirements: {
      authorization_details: [detail],
      satisfy: "all",
      max_capability_ttl_seconds: definition.slug === "tax-office" ? 300 : 900
    },
    wauth_binding: {
      method: "rp_action_hash",
      hash_alg: "S256",
      action_profile: definition.actionProfile,
      action_hash: actionHash,
      challenge_id: `wauth-chal-${transactionId}`,
      nonce: `nonce-${transactionId}`,
      issued_at: clock.nowIsoString(),
      expires_at: new Date((clock.nowEpochSeconds() + 300) * 1000).toISOString(),
      transaction_id: transactionId
    }
  };

  const schemaValidation = schemaRegistry.validateByFileName(
    "wauth-required.v0.2.schema.json",
    wauthRequired
  );
  if (!schemaValidation.ok) {
    throw new Error(`generated wauth_required did not validate: ${schemaValidation.errors.join("; ")}`);
  }

  return wauthRequired;
}

export function mockRpActionPathForPagePath(pathname: string): string | undefined {
  const definition = definitionForPath(pathname);
  if (!definition) {
    return undefined;
  }
  const landingPath = definitionForLandingPath(pathname)
    ? normalizePath(pathname)
    : definition.landingPaths.find((candidate) => normalizePath(pathname).startsWith(candidate));
  return landingPath ? `${landingPath}${definition.actionSuffix}` : undefined;
}

export function mockRpAudienceForPath(origin: string, pathname: string): string | undefined {
  const actionPath = mockRpActionPathForPagePath(pathname);
  return actionPath ? absoluteUrl(origin, actionPath) : undefined;
}

export function mockRpActionDefinitionForPath(pathname: string): {
  slug: MockRpSlug;
  method: "GET" | "POST";
  name: string;
  actionProfile: string;
} | undefined {
  const definition = definitionForActionPath(pathname);
  if (!definition) {
    return undefined;
  }
  return {
    slug: definition.slug,
    method: definition.method,
    name: definition.name,
    actionProfile: definition.actionProfile
  };
}

export function preferredMockRpActionPath(originBaseUrl: string, slug: MockRpSlug): string {
  const parsed = new URL(originBaseUrl);
  const apiStyle = parsed.pathname === "/api" || parsed.pathname.startsWith("/api/");
  const definition = MOCK_RP_DEFINITIONS.find((candidate) => candidate.slug === slug);
  if (!definition) {
    throw new Error(`unknown mock RP slug: ${slug}`);
  }
  const landingPath = definition.landingPaths.find((candidate) => apiStyle === candidate.startsWith("/api/"));
  if (!landingPath) {
    throw new Error(`no landing path found for ${slug}`);
  }
  return `${landingPath}${definition.actionSuffix}`;
}

export function buildMockRpActionInstance(
  pathname: string,
  input: Record<string, string | undefined>
): DemoActionInstance | undefined {
  const definition = definitionForPath(pathname);
  return definition?.buildActionInstance(input);
}

export function buildMockRpActionInput(
  actionInstance: DemoActionInstance
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(actionInstance).flatMap(([key, value]) => {
      if (key === "profile" || key === "action" || key === "resource") {
        return [];
      }
      return typeof value === "string"
        ? [[key, value]]
        : [];
    })
  );
}

export function buildMockRpRequirements(options: {
  origin: string;
  resourcePath: string;
}): Record<string, JsonValue> | undefined {
  const definition = definitionForLandingPath(options.resourcePath);
  const audience = mockRpAudienceForPath(options.origin, options.resourcePath);
  if (!definition || !audience) {
    return undefined;
  }
  return {
    authorization_details: [
      {
        type: "https://schemas.aaif.io/wauth/rar/wauth-action-authorization-details/v0.1",
        actions: [definition.actionName],
        locations: [audience],
        action_profile: definition.actionProfile,
        hash_alg: "S256",
        assurance: {
          min_pohp: definition.minPohp
        },
        envelope: {
          max_uses: 1
        }
      }
    ],
    satisfy: "all",
    max_capability_ttl_seconds: definition.slug === "tax-office" ? 300 : 900
  };
}

export class MockProtectedResourceService {
  private readonly issuer: string;
  private readonly jwks: { keys: Record<string, JsonValue>[] };
  private readonly schemaRegistry = new WauthSchemaRegistry(resolveSchemaDirectory());
  private readonly clock: Clock = new SystemClock();
  private readonly capabilityReplayGuard = new InMemoryReplayGuard(() => this.clock.nowEpochSeconds());
  private readonly dpopReplayGuard = new InMemoryReplayGuard(() => this.clock.nowEpochSeconds());

  constructor(options: {
    issuer: string;
    jwks: { keys: Record<string, JsonValue>[] };
  }) {
    this.issuer = options.issuer;
    this.jwks = options.jwks;
  }

  async verify(options: {
    pathname: string;
    requestUrl: string;
    method: string;
    input: Record<string, string | undefined>;
    auth?: {
      token: string;
      dpopProof: string;
    };
  }): Promise<MockRpVerificationResult> {
    const definition = definitionForActionPath(options.pathname);
    if (!definition) {
      throw new Error(`unknown mock RP action path: ${options.pathname}`);
    }

    const actionUrl = new URL(options.requestUrl);
    const audience = absoluteUrl(actionUrl.origin, actionUrl.pathname);
    const actionInstance = definition.buildActionInstance(options.input);
    const wauthRequired = buildWauthRequired(
      definition,
      audience,
      actionInstance,
      this.clock,
      this.schemaRegistry
    );

    if (!options.auth) {
      return {
        ok: false,
        status: 401,
        wauthRequired
      };
    }

    const verification = await verifyCapabilityRequestWithDpop({
      token: options.auth.token,
      jwks: this.jwks,
      expectedIssuer: this.issuer,
      expectedAudience: audience,
      expectedActionHash: computeProtocolActionHash(actionInstance),
      dpopProof: options.auth.dpopProof,
      requestMethod: options.method.toUpperCase(),
      requestUrl: options.requestUrl,
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
      rp: definition.name,
      accepted_at: this.clock.nowIsoString(),
      transaction_id: getRequiredString(wauthRequired, "transaction_id"),
      action_hash: computeProtocolActionHash(actionInstance),
      capability_jti: verification.replayKey ?? "unknown"
    };

    return {
      ok: true,
      status: 200,
      receipt,
      data: definition.buildData(actionInstance)
    };
  }
}

export function parseAuthorizationHeader(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const [scheme, token] = value.split(/\s+/, 2);
  if (!scheme || !token) {
    return undefined;
  }
  const normalized = scheme.toLowerCase();
  if (normalized !== "dpop" && normalized !== "bearer") {
    return undefined;
  }
  return token;
}

export function toMockRpInput(value: unknown): Record<string, string | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" && entry.length > 0 ? entry : undefined
    ])
  );
}
