import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

import { decodeJwtHeader, decodeJwtPayload, verifyJwtWithJwks } from "../src/jwt.js";
import { verifyCapabilityJwtWithJwks } from "../src/rp.js";

describe("wauth-ts JWT/JWKS helpers", () => {
  it("verifies JWT signature and capability claims against JWKS", async () => {
    const now = 1_700_000_000;
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-rs256-key";
    publicJwk.alg = "RS256";
    publicJwk.use = "sig";

    const token = await new SignJWT({ action_hash: "sha256:test" })
      .setProtectedHeader({ alg: "RS256", kid: "test-rs256-key", typ: "JWT" })
      .setIssuer("https://wauth.example")
      .setAudience("https://rp.example/api/payments")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .setJti("cap-jti-1")
      .sign(privateKey);

    const result = await verifyCapabilityJwtWithJwks({
      token,
      jwks: { keys: [publicJwk] },
      expectedIssuer: "https://wauth.example",
      expectedAudience: "https://rp.example/api/payments",
      expectedActionHash: "sha256:test",
      nowEpochSeconds: now + 60
    });

    expect(result.ok).toBe(true);
    expect(result.replayKey).toBe("cap-jti-1");
    expect(result.claims?.iss).toBe("https://wauth.example");
  });

  it("fails verification on tampered token", async () => {
    const now = 1_700_000_000;
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-rs256-key";
    publicJwk.alg = "RS256";

    const token = await new SignJWT({ action_hash: "sha256:test" })
      .setProtectedHeader({ alg: "RS256", kid: "test-rs256-key", typ: "JWT" })
      .setIssuer("https://wauth.example")
      .setAudience("https://rp.example/api/payments")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .setJti("cap-jti-2")
      .sign(privateKey);

    const [headerPart, payloadPart, signaturePart] = token.split(".");
    const tamperedSignature = `${signaturePart[0] === "a" ? "b" : "a"}${signaturePart.slice(1)}`;
    const badToken = `${headerPart}.${payloadPart}.${tamperedSignature}`;
    const verification = await verifyJwtWithJwks({
      token: badToken,
      jwks: { keys: [publicJwk] },
      expectedIssuer: "https://wauth.example",
      expectedAudience: "https://rp.example/api/payments",
      nowEpochSeconds: now + 60
    });

    expect(verification.ok).toBe(false);
    expect(verification.errors[0]).toContain("JWT verification failed");
  });

  it("fails verification on action hash mismatch", async () => {
    const now = 1_700_000_000;
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-rs256-key-mismatch";
    publicJwk.alg = "RS256";
    publicJwk.use = "sig";

    const token = await new SignJWT({ action_hash: "sha256:test" })
      .setProtectedHeader({ alg: "RS256", kid: "test-rs256-key-mismatch", typ: "JWT" })
      .setIssuer("https://wauth.example")
      .setAudience("https://rp.example/api/payments")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .setJti("cap-jti-mismatch")
      .sign(privateKey);

    const result = await verifyCapabilityJwtWithJwks({
      token,
      jwks: { keys: [publicJwk] },
      expectedIssuer: "https://wauth.example",
      expectedAudience: "https://rp.example/api/payments",
      expectedActionHash: "sha256:not-the-same",
      nowEpochSeconds: now + 60
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("action hash mismatch");
  });

  it("decodes JWT header and payload without verification", async () => {
    const now = 1_700_000_000;
    const { privateKey } = await generateKeyPair("RS256");

    const token = await new SignJWT({ action_hash: "sha256:test" })
      .setProtectedHeader({ alg: "RS256", kid: "decode-key", typ: "JWT" })
      .setIssuer("https://wauth.example")
      .setAudience("https://rp.example/api/payments")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .setJti("cap-jti-3")
      .sign(privateKey);

    const header = decodeJwtHeader(token);
    const payload = decodeJwtPayload(token);

    expect(header.kid).toBe("decode-key");
    expect(payload.iss).toBe("https://wauth.example");
  });
});
