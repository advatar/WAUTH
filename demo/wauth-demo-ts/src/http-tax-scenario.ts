import { generateKeyPair, exportJWK } from "jose";

import {
  buildBearerDpopAuthorizationHeader,
  computeJwkThumbprint,
  createDpopProof,
  type JsonValue,
  type WauthArtifact
} from "./sdk.js";
import { type DemoActionInstance, type DemoReceipt, type DemoTimelineEvent, type TaxDemoRunResult } from "./engine.js";
import {
  buildMockRpActionInput,
  buildMockRpActionInstance,
  preferredMockRpActionPath,
  type MockRpSlug
} from "./mock-rp.js";
import { type WauthRequestService } from "./wauth-state.js";

interface HttpTaxScenarioOptions {
  issuerBaseUrl: string;
  workflowId: string;
  wauthService: WauthRequestService;
  fetchFn?: typeof fetch;
}

interface FlowStep {
  slug: MockRpSlug;
  label: "BankRP" | "EmployerRP" | "IRSRP";
  requestIdSuffix: string;
  actionInstance: DemoActionInstance;
}

function extractTokenFromArtifact(artifact: WauthArtifact): string {
  if (typeof artifact.inline === "string" && artifact.inline.length > 0) {
    return artifact.inline;
  }

  if (
    artifact.inline
    && typeof artifact.inline === "object"
    && !Array.isArray(artifact.inline)
    && typeof artifact.inline.token === "string"
    && artifact.inline.token.length > 0
  ) {
    return artifact.inline.token;
  }

  throw new Error("artifact did not include inline capability token");
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildRequestUrl(baseUrl: string, path: string, actionInstance: DemoActionInstance): {
  url: URL;
  input: Record<string, string | undefined>;
} {
  const url = new URL(path, baseUrl);
  const input = buildMockRpActionInput(actionInstance);
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      url.searchParams.set(key, value);
    }
  }
  return {
    url,
    input
  };
}

function bodyForAction(actionInstance: DemoActionInstance): string | undefined {
  const payload = buildMockRpActionInput(actionInstance);
  return Object.keys(payload).length > 0
    ? JSON.stringify(payload)
    : undefined;
}

function bankActionInstance(): DemoActionInstance {
  return {
    profile: "aaif.wauth.action.bank.read_statement/v0.1",
    action: "read_statement",
    resource: "bank:acct:1234",
    account_id: "1234",
    month: "2026-01"
  };
}

function employerActionInstance(): DemoActionInstance {
  return {
    profile: "aaif.wauth.action.employer.read_income/v0.1",
    action: "read_income",
    resource: "employer:tax-year:2025",
    employee_id: "EMP-001",
    tax_year: "2025"
  };
}

function irsActionInstance(): DemoActionInstance {
  return {
    profile: "aaif.wauth.action.irs.submit_return/v0.1",
    action: "submit_return",
    resource: "irs:return:2025",
    filing_id: "FILING-2025-0001",
    tax_year: "2025"
  };
}

async function runProtectedActionOverHttp(options: {
  baseUrl: string;
  fetchFn: typeof fetch;
  wauthService: WauthRequestService;
  workflowId: string;
  timeline: DemoTimelineEvent[];
  label: FlowStep["label"];
  slug: MockRpSlug;
  requestIdSuffix: string;
  actionInstance: DemoActionInstance;
  publicJwk: Record<string, JsonValue>;
  privateKey: CryptoKey;
  jkt: string;
}): Promise<DemoReceipt> {
  const actionPath = preferredMockRpActionPath(options.baseUrl, options.slug);
  const method = options.slug === "tax-office" ? "POST" : "GET";
  const { url } = buildRequestUrl(options.baseUrl, actionPath, options.actionInstance);

  options.timeline.push({
    at: nowIso(),
    type: "rp.initial_attempt",
    detail: {
      rp: options.label,
      request_url: url.toString()
    }
  });

  const firstResponse = await options.fetchFn(url, {
    method,
    headers: method === "POST"
      ? {
          "content-type": "application/json",
          accept: "application/json"
        }
      : {
          accept: "application/json"
        },
    body: method === "POST" ? bodyForAction(options.actionInstance) : undefined
  });

  if (firstResponse.status !== 401) {
    throw new Error(`${options.label}: expected initial 401 from protected resource, got ${firstResponse.status}`);
  }

  const wauthRequired = await firstResponse.json() as Record<string, JsonValue>;
  const rebuiltActionInstance = buildMockRpActionInstance(actionPath, buildMockRpActionInput(options.actionInstance));
  if (!rebuiltActionInstance) {
    throw new Error(`${options.label}: failed to rebuild action instance for ${actionPath}`);
  }

  const requestId = `${options.workflowId}-${options.requestIdSuffix}`;
  const pending = await options.wauthService.request(undefined, {
    requestId,
    wauthRequired,
    actionInstance: rebuiltActionInstance,
    agentIdentity: {
      cnf_jkt: options.jkt
    }
  });

  if (!pending.pendingApproval) {
    throw new Error(`${options.label}: expected pending WAUTH approval for ${requestId}`);
  }

  options.timeline.push({
    at: nowIso(),
    type: "wallet.capability_requested",
    detail: {
      rp: options.label,
      request_id: requestId,
      approval_id: pending.pendingApproval.approvalId
    }
  });

  const issued = await options.wauthService.approveByApprovalId(pending.pendingApproval.approvalId);
  const artifactRef = issued.envelope?.artifacts?.[0]?.ref;
  if (typeof artifactRef !== "string" || artifactRef.length === 0) {
    throw new Error(`${options.label}: missing artifact ref for ${requestId}`);
  }
  const artifact = await options.wauthService.getArtifact(artifactRef);
  const token = extractTokenFromArtifact(artifact);

  const dpopProof = await createDpopProof({
    privateKey: options.privateKey,
    publicJwk: options.publicJwk,
    htm: method,
    htu: url.toString(),
    accessToken: token,
    iatEpochSeconds: Math.floor(Date.now() / 1000)
  });

  options.timeline.push({
    at: nowIso(),
    type: "rp.retry_attempt",
    detail: {
      rp: options.label,
      request_id: requestId,
      request_url: url.toString()
    }
  });

  const secondResponse = await options.fetchFn(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: buildBearerDpopAuthorizationHeader(token),
      dpop: dpopProof,
      ...(method === "POST" ? { "content-type": "application/json" } : {})
    },
    body: method === "POST" ? bodyForAction(options.actionInstance) : undefined
  });

  const payload = await secondResponse.json() as {
    ok?: boolean;
    receipt?: DemoReceipt;
    verification_errors?: string[];
  };
  if (!secondResponse.ok || !payload.ok || !payload.receipt) {
    throw new Error(
      `${options.label}: protected resource retry failed, status=${secondResponse.status}, errors=${(payload.verification_errors ?? []).join(",")}`
    );
  }

  options.timeline.push({
    at: nowIso(),
    type: "rp.accepted",
    detail: {
      rp: options.label,
      request_id: requestId,
      transaction_id: payload.receipt.transaction_id,
      action_hash: payload.receipt.action_hash
    }
  });

  return payload.receipt;
}

export async function runHttpTaxDemoScenario(
  options: HttpTaxScenarioOptions
): Promise<TaxDemoRunResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeline: DemoTimelineEvent[] = [];

  const metadata = await options.wauthService.metadata();
  timeline.push({
    at: nowIso(),
    type: "wallet.metadata_checked",
    detail: {
      issuer: metadata.issuer as string,
      jwks_uri: metadata.jwks_uri as string
    }
  });

  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  publicJwk.kid = "demo-kcs-es256-http";
  const jkt = await computeJwkThumbprint(publicJwk);

  const steps: FlowStep[] = [
    {
      slug: "bank",
      label: "BankRP",
      requestIdSuffix: "bank",
      actionInstance: bankActionInstance()
    },
    {
      slug: "hr",
      label: "EmployerRP",
      requestIdSuffix: "employer",
      actionInstance: employerActionInstance()
    },
    {
      slug: "tax-office",
      label: "IRSRP",
      requestIdSuffix: "irs",
      actionInstance: irsActionInstance()
    }
  ];

  const receipts: DemoReceipt[] = [];
  for (const step of steps) {
    const receipt = await runProtectedActionOverHttp({
      baseUrl: options.issuerBaseUrl,
      fetchFn,
      wauthService: options.wauthService,
      workflowId: options.workflowId,
      timeline,
      label: step.label,
      slug: step.slug,
      requestIdSuffix: step.requestIdSuffix,
      actionInstance: step.actionInstance,
      publicJwk: publicJwk as Record<string, JsonValue>,
      privateKey,
      jkt
    });
    receipts.push(receipt);
  }

  return {
    ok: true,
    metadata,
    receipts,
    timeline
  };
}
