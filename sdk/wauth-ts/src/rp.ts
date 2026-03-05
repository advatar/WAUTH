import type { JSONWebKeySet } from "jose";

import type { JsonValue } from "./types.js";
import type { ReplayGuard } from "./dpop.js";
import { extractConfirmationJkt, verifyDpopProof, type DpopVerificationResult } from "./dpop.js";
import { verifyJwtWithJwks } from "./jwt.js";

export interface CapabilityValidationInput {
  claims: Record<string, JsonValue>;
  expectedAudience: string;
  expectedActionHash: string;
  nowEpochSeconds?: number;
  maxClockSkewSeconds?: number;
}

export interface CapabilityValidationResult {
  ok: boolean;
  errors: string[];
  replayKey?: string;
}

export interface CapabilityJwtVerificationInput {
  token: string;
  jwks: JSONWebKeySet;
  expectedIssuer?: string;
  expectedAudience: string;
  expectedActionHash: string;
  nowEpochSeconds?: number;
  maxClockSkewSeconds?: number;
  allowedAlgorithms?: string[];
}

export interface CapabilityJwtVerificationResult extends CapabilityValidationResult {
  claims?: Record<string, JsonValue>;
  header?: Record<string, JsonValue>;
}

export interface CapabilityRequestVerificationInput extends CapabilityJwtVerificationInput {
  dpopProof: string;
  requestMethod: string;
  requestUrl: string;
  dpopNonce?: string;
  capabilityReplayGuard?: ReplayGuard;
  dpopReplayGuard?: ReplayGuard;
}

export interface CapabilityRequestVerificationResult extends CapabilityJwtVerificationResult {
  dpop?: DpopVerificationResult;
}

function consumeCapabilityReplay(
  guard: ReplayGuard | undefined,
  claims: Record<string, JsonValue> | undefined,
  replayKey: string | undefined
): string | undefined {
  if (!guard || !replayKey) {
    return undefined;
  }

  const issuer = typeof claims?.iss === "string" ? claims.iss : "unknown";
  const compositeReplayKey = `cap:${issuer}:${replayKey}`;
  const expiresAt = typeof claims?.exp === "number" ? claims.exp : undefined;
  if (!guard.consume(compositeReplayKey, expiresAt)) {
    return "capability token replay detected";
  }
  return undefined;
}

function audienceIncludes(audClaim: JsonValue | undefined, expectedAudience: string): boolean {
  if (typeof audClaim === "string") {
    return audClaim === expectedAudience;
  }
  if (Array.isArray(audClaim)) {
    return audClaim.some((value) => value === expectedAudience);
  }
  return false;
}

export function validateCapabilityClaims(input: CapabilityValidationInput): CapabilityValidationResult {
  const now = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const skew = input.maxClockSkewSeconds ?? 120;
  const errors: string[] = [];
  const claims = input.claims;

  if (!audienceIncludes(claims.aud, input.expectedAudience)) {
    errors.push("audience mismatch");
  }

  if (typeof claims.exp !== "number" || claims.exp < now - skew) {
    errors.push("token expired");
  }

  if (typeof claims.iat !== "number" || claims.iat > now + skew) {
    errors.push("issued-at is in the future beyond skew");
  }

  if (claims.action_hash !== input.expectedActionHash) {
    errors.push("action hash mismatch");
  }

  if (typeof claims.jti !== "string" || claims.jti.length === 0) {
    errors.push("missing jti for replay protection");
  }

  return {
    ok: errors.length === 0,
    errors,
    replayKey: typeof claims.jti === "string" ? claims.jti : undefined
  };
}

export async function verifyCapabilityJwtWithJwks(
  input: CapabilityJwtVerificationInput
): Promise<CapabilityJwtVerificationResult> {
  const jwtResult = await verifyJwtWithJwks({
    token: input.token,
    jwks: input.jwks,
    expectedIssuer: input.expectedIssuer,
    expectedAudience: input.expectedAudience,
    expectedActionHash: input.expectedActionHash,
    nowEpochSeconds: input.nowEpochSeconds,
    clockToleranceSeconds: input.maxClockSkewSeconds,
    allowedAlgorithms: input.allowedAlgorithms,
    requireJti: true
  });

  if (!jwtResult.ok || !jwtResult.claims) {
    return {
      ok: false,
      errors: jwtResult.errors,
      replayKey: jwtResult.replayKey,
      claims: jwtResult.claims,
      header: jwtResult.header as unknown as Record<string, JsonValue>
    };
  }

  const claimResult = validateCapabilityClaims({
    claims: jwtResult.claims,
    expectedAudience: input.expectedAudience,
    expectedActionHash: input.expectedActionHash,
    nowEpochSeconds: input.nowEpochSeconds,
    maxClockSkewSeconds: input.maxClockSkewSeconds
  });

  return {
    ok: jwtResult.ok && claimResult.ok,
    errors: [...jwtResult.errors, ...claimResult.errors],
    replayKey: claimResult.replayKey ?? jwtResult.replayKey,
    claims: jwtResult.claims,
    header: jwtResult.header as unknown as Record<string, JsonValue>
  };
}

export async function verifyCapabilityRequestWithDpop(
  input: CapabilityRequestVerificationInput
): Promise<CapabilityRequestVerificationResult> {
  const capability = await verifyCapabilityJwtWithJwks({
    token: input.token,
    jwks: input.jwks,
    expectedIssuer: input.expectedIssuer,
    expectedAudience: input.expectedAudience,
    expectedActionHash: input.expectedActionHash,
    nowEpochSeconds: input.nowEpochSeconds,
    maxClockSkewSeconds: input.maxClockSkewSeconds,
    allowedAlgorithms: input.allowedAlgorithms
  });

  const errors = [...capability.errors];
  const replayError = consumeCapabilityReplay(
    input.capabilityReplayGuard,
    capability.claims,
    capability.replayKey
  );
  if (replayError) {
    errors.push(replayError);
  }

  const expectedJkt = capability.claims
    ? extractConfirmationJkt(capability.claims)
    : undefined;

  const dpop = await verifyDpopProof({
    proof: input.dpopProof,
    htm: input.requestMethod,
    htu: input.requestUrl,
    accessToken: input.token,
    expectedNonce: input.dpopNonce,
    expectedJkt,
    nowEpochSeconds: input.nowEpochSeconds,
    maxIatSkewSeconds: input.maxClockSkewSeconds,
    replayGuard: input.dpopReplayGuard
  });
  errors.push(...dpop.errors);

  return {
    ok: capability.ok && dpop.ok && errors.length === 0,
    errors,
    replayKey: capability.replayKey,
    claims: capability.claims,
    header: capability.header,
    dpop
  };
}
