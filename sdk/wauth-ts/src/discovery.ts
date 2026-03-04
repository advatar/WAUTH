import type { JsonValue } from "./types.js";

export interface WauthConfig {
  issuer: string;
  jwks_uri: string;
  [key: string]: JsonValue;
}

export function wellKnownWauthConfigUrl(issuer: string): string {
  const normalized = issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
  return `${normalized}/.well-known/aaif-wauth-configuration`;
}

export async function fetchWauthConfig(
  issuer: string,
  fetchFn: typeof fetch = fetch
): Promise<WauthConfig> {
  const response = await fetchFn(wellKnownWauthConfigUrl(issuer));
  if (!response.ok) {
    throw new Error(`failed to fetch WAUTH-CONFIG: ${response.status}`);
  }

  const json = (await response.json()) as WauthConfig;
  if (typeof json.issuer !== "string" || typeof json.jwks_uri !== "string") {
    throw new Error("invalid WAUTH-CONFIG response");
  }
  return json;
}
