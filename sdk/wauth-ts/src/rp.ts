import type { JSONWebKeySet } from "jose";

import type { JsonValue } from "./types.js";
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
