import type { JSONWebKeySet, JWK } from "jose";

import { wellKnownWauthConfigUrl } from "./discovery.js";
import type { WauthMetadataEnvelope } from "./mcp.js";

export type FetchJson = (url: string) => Promise<unknown>;

export interface CachedJwks {
  jwks: JSONWebKeySet;
  fetchedAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
}

export interface WauthJwksCacheOptions {
  ttlSeconds?: number;
  fetchJson: FetchJson;
  nowEpochSeconds?: () => number;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected object payload");
  }
  return value as Record<string, unknown>;
}

function parseMetadata(value: unknown): WauthMetadataEnvelope {
  const record = asRecord(value);
  if (typeof record.issuer !== "string" || typeof record.jwks_uri !== "string") {
    throw new Error("invalid WAUTH metadata payload");
  }

  return record as unknown as WauthMetadataEnvelope;
}

function parseJwks(value: unknown): JSONWebKeySet {
  const record = asRecord(value);
  if (!Array.isArray(record.keys)) {
    throw new Error("invalid JWKS payload");
  }
  return record as JSONWebKeySet;
}

export class WauthJwksCache {
  private readonly ttlSeconds: number;
  private readonly fetchJson: FetchJson;
  private readonly nowEpochSeconds: () => number;
  private readonly byIssuer = new Map<string, CachedJwks>();

  constructor(options: WauthJwksCacheOptions) {
    this.ttlSeconds = options.ttlSeconds ?? 300;
    this.fetchJson = options.fetchJson;
    this.nowEpochSeconds = options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  async fetchMetadata(issuer: string): Promise<WauthMetadataEnvelope> {
    const metadataUrl = wellKnownWauthConfigUrl(issuer);
    const payload = await this.fetchJson(metadataUrl);
    return parseMetadata(payload);
  }

  async fetchJwksFromMetadata(metadata: Pick<WauthMetadataEnvelope, "issuer" | "jwks_uri">): Promise<JSONWebKeySet> {
    const payload = await this.fetchJson(metadata.jwks_uri);
    return parseJwks(payload);
  }

  async getForIssuer(issuer: string, options?: { forceRefresh?: boolean }): Promise<JSONWebKeySet> {
    const now = this.nowEpochSeconds();
    const existing = this.byIssuer.get(issuer);
    if (!options?.forceRefresh && existing && existing.expiresAtEpochSeconds > now) {
      return existing.jwks;
    }

    const metadata = await this.fetchMetadata(issuer);
    const jwks = await this.fetchJwksFromMetadata(metadata);
    this.byIssuer.set(issuer, {
      jwks,
      fetchedAtEpochSeconds: now,
      expiresAtEpochSeconds: now + this.ttlSeconds
    });
    return jwks;
  }

  async getForKid(issuer: string, kid: string): Promise<{ jwks: JSONWebKeySet; key?: JWK }> {
    let jwks = await this.getForIssuer(issuer);
    let key = jwks.keys?.find((candidate) => candidate.kid === kid);
    if (key) {
      return { jwks, key };
    }

    jwks = await this.getForIssuer(issuer, { forceRefresh: true });
    key = jwks.keys?.find((candidate) => candidate.kid === kid);
    return { jwks, key };
  }

  clear(issuer?: string): void {
    if (issuer) {
      this.byIssuer.delete(issuer);
      return;
    }
    this.byIssuer.clear();
  }
}
