import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

import {
  InMemoryReplayGuard,
  buildBearerDpopAuthorizationHeader,
  computeJwkThumbprint,
  createDpopProof,
  extractConfirmationJkt,
  verifyDpopProof
} from "../src/dpop.js";
import { verifyCapabilityRequestWithDpop } from "../src/rp.js";

describe("wauth-ts DPoP helpers", () => {
  it("creates and verifies a DPoP proof with ath and cnf.jkt binding", async () => {
    const now = 1_700_000_000;
    const accessToken = "capability-token-value";
    const htm = "POST";
    const htu = "https://rp.example/api/checkout/complete";
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = await exportJWK(publicKey);
    const expectedJkt = await computeJwkThumbprint(publicJwk);

    const proof = await createDpopProof({
      privateKey,
      publicJwk,
      htm,
      htu,
      accessToken,
      iatEpochSeconds: now,
      jti: "dpop-jti-1"
    });

    const replayGuard = new InMemoryReplayGuard(() => now + 1);
    const verification = await verifyDpopProof({
      proof,
      htm,
      htu,
      accessToken,
      expectedJkt,
      nowEpochSeconds: now + 1,
      replayGuard
    });

    expect(verification.ok).toBe(true);
    expect(verification.jkt).toBe(expectedJkt);
    expect(verification.replayKey).toBe("dpop:dpop-jti-1");
    expect(verification.claims?.htm).toBe("POST");
    expect(buildBearerDpopAuthorizationHeader(accessToken)).toBe(`DPoP ${accessToken}`);
    expect(extractConfirmationJkt({ cnf: { jkt: expectedJkt } })).toBe(expectedJkt);
  });

  it("rejects replayed DPoP proofs when replay guard is used", async () => {
    const now = 1_700_000_000;
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = await exportJWK(publicKey);
    const expectedJkt = await computeJwkThumbprint(publicJwk);

    const proof = await createDpopProof({
      privateKey,
      publicJwk,
      htm: "GET",
      htu: "https://rp.example/api/bank/statement",
      iatEpochSeconds: now,
      jti: "dpop-jti-replay"
    });

    const replayGuard = new InMemoryReplayGuard(() => now + 1);
    const first = await verifyDpopProof({
      proof,
      htm: "GET",
      htu: "https://rp.example/api/bank/statement",
      expectedJkt,
      nowEpochSeconds: now + 1,
      replayGuard
    });
    const second = await verifyDpopProof({
      proof,
      htm: "GET",
      htu: "https://rp.example/api/bank/statement",
      expectedJkt,
      nowEpochSeconds: now + 1,
      replayGuard
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.errors).toContain("DPoP proof replay detected");
  });

  it("fails verification when ath does not match the access token", async () => {
    const now = 1_700_000_000;
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = await exportJWK(publicKey);
    const expectedJkt = await computeJwkThumbprint(publicJwk);

    const proof = await createDpopProof({
      privateKey,
      publicJwk,
      htm: "POST",
      htu: "https://rp.example/api/irs/submit",
      accessToken: "token-a",
      iatEpochSeconds: now
    });

    const verification = await verifyDpopProof({
      proof,
      htm: "POST",
      htu: "https://rp.example/api/irs/submit",
      accessToken: "token-b",
      expectedJkt,
      nowEpochSeconds: now + 1
    });

    expect(verification.ok).toBe(false);
    expect(verification.errors).toContain("DPoP ath mismatch");
  });

  it("fails verification when request method does not match", async () => {
    const now = 1_700_000_000;
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = await exportJWK(publicKey);

    const proof = await createDpopProof({
      privateKey,
      publicJwk,
      htm: "POST",
      htu: "https://rp.example/api/irs/submit",
      iatEpochSeconds: now
    });

    const verification = await verifyDpopProof({
      proof,
      htm: "GET",
      htu: "https://rp.example/api/irs/submit",
      nowEpochSeconds: now + 1
    });

    expect(verification.ok).toBe(false);
    expect(verification.errors).toContain("DPoP htm mismatch");
  });

  it("verifies capability + DPoP + cnf.jkt in one RP helper", async () => {
    const now = 1_700_000_000;
    const actionHash = "sha256:action";
    const expectedAudience = "https://rp.example/api/checkout/complete";
    const requestMethod = "POST";
    const requestUrl = "https://rp.example/api/checkout/complete";

    const { privateKey: capabilityPrivate, publicKey: capabilityPublic } = await generateKeyPair("RS256");
    const capabilityPublicJwk = await exportJWK(capabilityPublic);
    capabilityPublicJwk.kid = "cap-key-1";
    capabilityPublicJwk.alg = "RS256";
    capabilityPublicJwk.use = "sig";

    const { privateKey: dpopPrivate, publicKey: dpopPublic } = await generateKeyPair("ES256");
    const dpopPublicJwk = await exportJWK(dpopPublic);
    const dpopJkt = await computeJwkThumbprint(dpopPublicJwk);

    const capabilityToken = await new SignJWT({
      action_hash: actionHash,
      cnf: { jkt: dpopJkt }
    })
      .setProtectedHeader({ alg: "RS256", kid: "cap-key-1", typ: "JWT" })
      .setIssuer("https://wauth.example")
      .setAudience(expectedAudience)
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .setJti("cap-jti-dpop-1")
      .sign(capabilityPrivate);

    const dpopProof = await createDpopProof({
      privateKey: dpopPrivate,
      publicJwk: dpopPublicJwk,
      htm: requestMethod,
      htu: requestUrl,
      accessToken: capabilityToken,
      iatEpochSeconds: now,
      jti: "dpop-jti-combined-1"
    });

    const capabilityReplayGuard = new InMemoryReplayGuard(() => now + 1);
    const dpopReplayGuard = new InMemoryReplayGuard(() => now + 1);
    const result = await verifyCapabilityRequestWithDpop({
      token: capabilityToken,
      jwks: { keys: [capabilityPublicJwk] },
      expectedIssuer: "https://wauth.example",
      expectedAudience,
      expectedActionHash: actionHash,
      dpopProof,
      requestMethod,
      requestUrl,
      nowEpochSeconds: now + 1,
      capabilityReplayGuard,
      dpopReplayGuard
    });

    expect(result.ok).toBe(true);
    expect(result.replayKey).toBe("cap-jti-dpop-1");
    expect(result.dpop?.jkt).toBe(dpopJkt);
  });
});
