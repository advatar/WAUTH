import {
  createLocalJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWSHeaderParameters,
  type JWTPayload,
  type JWTVerifyOptions
} from "jose";

import type { JsonValue } from "./types.js";

export interface JwtVerificationInput {
  token: string;
  jwks: JSONWebKeySet;
  expectedIssuer?: string;
  expectedAudience?: string | string[];
  expectedSubject?: string;
  nowEpochSeconds?: number;
  clockToleranceSeconds?: number;
  allowedAlgorithms?: string[];
  expectedActionHash?: string;
  requireJti?: boolean;
}

export interface JwtVerificationResult {
  ok: boolean;
  errors: string[];
  header?: JWSHeaderParameters;
  claims?: Record<string, JsonValue>;
  replayKey?: string;
}

function extractActionHash(payload: JWTPayload): string | undefined {
  if (typeof payload.action_hash === "string") {
    return payload.action_hash;
  }

  const authorizationDetails = payload.authorization_details;
  if (!Array.isArray(authorizationDetails)) {
    return undefined;
  }

  for (const detail of authorizationDetails) {
    if (
      typeof detail === "object" &&
      detail !== null &&
      !Array.isArray(detail) &&
      typeof (detail as Record<string, unknown>).action_hash === "string"
    ) {
      return (detail as Record<string, string>).action_hash;
    }
  }

  return undefined;
}

function asRecordClaims(payload: JWTPayload): Record<string, JsonValue> {
  return payload as unknown as Record<string, JsonValue>;
}

export function decodeJwtPayload(token: string): Record<string, JsonValue> {
  return decodeJwt(token) as unknown as Record<string, JsonValue>;
}

export function decodeJwtHeader(token: string): JWSHeaderParameters {
  return decodeProtectedHeader(token);
}

export async function verifyJwtWithJwks(input: JwtVerificationInput): Promise<JwtVerificationResult> {
  let header: JWSHeaderParameters | undefined;

  try {
    header = decodeProtectedHeader(input.token);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `invalid JWT protected header: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }

  try {
    const keyResolver = createLocalJWKSet(input.jwks);
    const verifyOptions: JWTVerifyOptions = {
      algorithms: (input.allowedAlgorithms ?? ["RS256", "ES256", "EdDSA"]) as JWTVerifyOptions["algorithms"],
      issuer: input.expectedIssuer,
      audience: input.expectedAudience,
      subject: input.expectedSubject,
      clockTolerance: input.clockToleranceSeconds ?? 120
    };

    if (typeof input.nowEpochSeconds === "number") {
      verifyOptions.currentDate = new Date(input.nowEpochSeconds * 1000);
    }

    const { payload } = await jwtVerify(input.token, keyResolver, verifyOptions);
    const errors: string[] = [];

    const actionHash = extractActionHash(payload);
    if (typeof input.expectedActionHash === "string" && actionHash !== input.expectedActionHash) {
      errors.push("action hash mismatch");
    }

    const jti = typeof payload.jti === "string" ? payload.jti : undefined;
    if ((input.requireJti ?? true) && !jti) {
      errors.push("missing jti for replay protection");
    }

    return {
      ok: errors.length === 0,
      errors,
      header,
      claims: asRecordClaims(payload),
      replayKey: jti
    };
  } catch (error) {
    return {
      ok: false,
      errors: [`JWT verification failed: ${error instanceof Error ? error.message : String(error)}`],
      header
    };
  }
}
