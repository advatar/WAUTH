import { createHash, randomUUID } from "node:crypto";
import {
  SignJWT,
  calculateJwkThumbprint,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
  type JWSHeaderParameters
} from "jose";

import type { JsonValue } from "./types.js";

const PRIVATE_JWK_FIELDS = new Set(["d", "p", "q", "dp", "dq", "qi", "oth", "k"]);

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function normalizeHtu(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  return parsed.toString();
}

function base64UrlSha256(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function resolvePublicJwk(input: CreateDpopProofInput): JWK {
  if (input.publicJwk) {
    return input.publicJwk;
  }
  if (!input.privateJwk) {
    throw new Error("publicJwk is required when privateJwk is not provided");
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.privateJwk)) {
    if (!PRIVATE_JWK_FIELDS.has(key)) {
      out[key] = value;
    }
  }
  return out as JWK;
}

function isAllowedAsymmetricAlg(alg: string | undefined): boolean {
  if (!alg || alg === "none") {
    return false;
  }
  return !alg.startsWith("HS");
}

export interface CreateDpopProofInput {
  privateJwk?: JWK;
  privateKey?: CryptoKey;
  publicJwk?: JWK;
  htm: string;
  htu: string;
  accessToken?: string;
  nonce?: string;
  jti?: string;
  iatEpochSeconds?: number;
  alg?: string;
}

export interface DpopVerificationInput {
  proof: string;
  htm: string;
  htu: string;
  accessToken?: string;
  expectedNonce?: string;
  expectedJkt?: string;
  nowEpochSeconds?: number;
  maxIatSkewSeconds?: number;
  replayGuard?: ReplayGuard;
}

export interface DpopVerificationResult {
  ok: boolean;
  errors: string[];
  header?: JWSHeaderParameters;
  claims?: Record<string, JsonValue>;
  replayKey?: string;
  jkt?: string;
}

export interface ReplayGuard {
  consume(replayKey: string, expiresAtEpochSeconds?: number): boolean;
}

export class InMemoryReplayGuard implements ReplayGuard {
  private readonly entries = new Map<string, number | undefined>();
  private readonly nowEpochSeconds: () => number;

  constructor(nowEpochSeconds?: () => number) {
    this.nowEpochSeconds = nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  consume(replayKey: string, expiresAtEpochSeconds?: number): boolean {
    this.prune();
    if (this.entries.has(replayKey)) {
      return false;
    }
    this.entries.set(replayKey, expiresAtEpochSeconds);
    return true;
  }

  has(replayKey: string): boolean {
    this.prune();
    return this.entries.has(replayKey);
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(): void {
    const now = this.nowEpochSeconds();
    for (const [key, expiresAt] of this.entries.entries()) {
      if (typeof expiresAt === "number" && expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

export function buildBearerDpopAuthorizationHeader(accessToken: string): string {
  return `DPoP ${accessToken}`;
}

export function extractConfirmationJkt(claims: Record<string, JsonValue>): string | undefined {
  const cnf = asRecord(claims.cnf);
  return typeof cnf?.jkt === "string" ? cnf.jkt : undefined;
}

export async function computeJwkThumbprint(jwk: JWK): Promise<string> {
  return calculateJwkThumbprint(jwk);
}

export function computeDpopAth(accessToken: string): string {
  return base64UrlSha256(accessToken);
}

export async function createDpopProof(input: CreateDpopProofInput): Promise<string> {
  const alg = input.alg ?? "ES256";
  if (!isAllowedAsymmetricAlg(alg)) {
    throw new Error(`unsupported DPoP alg: ${alg}`);
  }
  const privateKey = input.privateKey ?? (
    input.privateJwk
      ? await importJWK(input.privateJwk, alg)
      : undefined
  );
  if (!privateKey) {
    throw new Error("createDpopProof requires privateKey or privateJwk");
  }
  const publicJwk = resolvePublicJwk(input);
  const now = input.iatEpochSeconds ?? Math.floor(Date.now() / 1000);
  const htm = input.htm.toUpperCase();
  const htu = normalizeHtu(input.htu);
  const jti = input.jti ?? randomUUID();

  const payload: Record<string, JsonValue> = {
    jti,
    htm,
    htu,
    iat: now
  };
  if (typeof input.nonce === "string") {
    payload.nonce = input.nonce;
  }
  if (typeof input.accessToken === "string") {
    payload.ath = computeDpopAth(input.accessToken);
  }

  return new SignJWT(payload)
    .setProtectedHeader({
      typ: "dpop+jwt",
      alg,
      jwk: publicJwk
    })
    .sign(privateKey);
}

export async function verifyDpopProof(input: DpopVerificationInput): Promise<DpopVerificationResult> {
  let header: JWSHeaderParameters | undefined;
  try {
    header = decodeProtectedHeader(input.proof);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `invalid DPoP protected header: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }

  const errors: string[] = [];
  if (header.typ !== "dpop+jwt") {
    errors.push("invalid DPoP typ");
  }
  if (!isAllowedAsymmetricAlg(header.alg)) {
    errors.push("invalid DPoP alg");
  }
  if (!header.jwk || typeof header.jwk !== "object") {
    errors.push("missing DPoP header jwk");
  }

  const claims: Record<string, JsonValue> = {};
  let jkt: string | undefined;

  if (errors.length === 0) {
    try {
      const key = await importJWK(header.jwk as JWK, header.alg);
      const verified = await jwtVerify(input.proof, key, {
        algorithms: [header.alg as string],
        currentDate: new Date((input.nowEpochSeconds ?? Math.floor(Date.now() / 1000)) * 1000)
      });

      Object.assign(claims, verified.payload as unknown as Record<string, JsonValue>);
      jkt = await computeJwkThumbprint(header.jwk as JWK);
    } catch (error) {
      errors.push(`DPoP signature verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const now = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const skew = input.maxIatSkewSeconds ?? 300;
  const expectedHtm = input.htm.toUpperCase();
  let expectedHtu: string | undefined;
  try {
    expectedHtu = normalizeHtu(input.htu);
  } catch {
    errors.push("invalid expected request htu");
  }

  const jti = typeof claims.jti === "string" ? claims.jti : undefined;
  const htm = typeof claims.htm === "string" ? claims.htm : undefined;
  const htu = typeof claims.htu === "string" ? claims.htu : undefined;
  const iat = typeof claims.iat === "number" ? claims.iat : undefined;

  if (!jti) {
    errors.push("missing DPoP jti");
  }
  if (!htm) {
    errors.push("missing DPoP htm");
  } else if (htm.toUpperCase() !== expectedHtm) {
    errors.push("DPoP htm mismatch");
  }
  if (!htu) {
    errors.push("missing DPoP htu");
  } else {
    try {
      const normalizedClaimHtu = normalizeHtu(htu);
      if (expectedHtu && normalizedClaimHtu !== expectedHtu) {
        errors.push("DPoP htu mismatch");
      }
    } catch {
      errors.push("invalid DPoP htu claim");
    }
  }
  if (typeof iat !== "number") {
    errors.push("missing DPoP iat");
  } else if (iat < now - skew || iat > now + skew) {
    errors.push("DPoP iat outside acceptable skew");
  }

  if (typeof input.accessToken === "string") {
    const ath = typeof claims.ath === "string" ? claims.ath : undefined;
    if (!ath) {
      errors.push("missing DPoP ath");
    } else if (ath !== computeDpopAth(input.accessToken)) {
      errors.push("DPoP ath mismatch");
    }
  }

  if (typeof input.expectedNonce === "string") {
    if (claims.nonce !== input.expectedNonce) {
      errors.push("DPoP nonce mismatch");
    }
  }

  if (typeof input.expectedJkt === "string") {
    if (jkt !== input.expectedJkt) {
      errors.push("DPoP cnf.jkt mismatch");
    }
  }

  if (input.replayGuard && jti) {
    const replayKey = `dpop:${jti}`;
    const expiresAt = typeof iat === "number" ? iat + skew : undefined;
    if (!input.replayGuard.consume(replayKey, expiresAt)) {
      errors.push("DPoP proof replay detected");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    header,
    claims: Object.keys(claims).length > 0 ? claims : undefined,
    replayKey: jti ? `dpop:${jti}` : undefined,
    jkt
  };
}
