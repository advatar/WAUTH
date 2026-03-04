import type { JsonValue } from "./types.js";

export interface WauthToolCall {
  name: string;
  arguments: Record<string, JsonValue>;
}

export interface WauthArtifact {
  kind: string;
  format: string;
  inline?: JsonValue;
  ref?: string;
}

export interface WauthResultEnvelope {
  version: string;
  requestId: string;
  artifacts?: WauthArtifact[];
  receipts?: Record<string, JsonValue>[];
  warnings?: string[];
  meta?: Record<string, JsonValue>;
}

export interface WauthMetadataEnvelope {
  issuer: string;
  jwks_uri: string;
  wauth_versions_supported: string[];
  intent_versions_supported: string[];
  profiles_supported: string[];
  formats_supported: string[];
  mcp: {
    tool_namespaces_supported: string[];
    tools_supported: string[];
  };
  [key: string]: JsonValue;
}

function asRecord(value: JsonValue): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function resolveStructuredContent(value: JsonValue): JsonValue {
  const record = asRecord(value);
  if (record && "structuredContent" in record) {
    return record.structuredContent;
  }
  return value;
}

function resolveNamespace(namespace?: "aaif.wauth" | "aaif.pwma"): "aaif.wauth" | "aaif.pwma" {
  return namespace ?? "aaif.wauth";
}

export function buildWauthRequest(
  args: Record<string, JsonValue>,
  options?: { requestId?: string; namespace?: "aaif.wauth" | "aaif.pwma" }
): WauthToolCall {
  const outArgs: Record<string, JsonValue> = { ...args };
  if (options?.requestId) {
    outArgs.requestId = options.requestId;
  }
  return {
    name: `${resolveNamespace(options?.namespace)}.request`,
    arguments: outArgs
  };
}

export function buildWauthGet(
  ref: string,
  options?: { namespace?: "aaif.wauth" | "aaif.pwma" }
): WauthToolCall {
  return {
    name: `${resolveNamespace(options?.namespace)}.get`,
    arguments: { ref }
  };
}

export function buildWauthMetadata(
  options?: { namespace?: "aaif.wauth" | "aaif.pwma" }
): WauthToolCall {
  return {
    name: `${resolveNamespace(options?.namespace)}.metadata`,
    arguments: {}
  };
}

export function extractElicitations(errorPayload: JsonValue): JsonValue[] {
  const record = asRecord(errorPayload);
  if (!record) {
    return [];
  }

  const data = asRecord(record.data);
  if (!data) {
    return [];
  }

  return Array.isArray(data.elicitations) ? data.elicitations : [];
}

export function parseWauthResultEnvelope(toolResult: JsonValue): WauthResultEnvelope {
  const content = resolveStructuredContent(toolResult);
  const record = asRecord(content);
  if (!record) {
    throw new Error("WAUTH result envelope must be a JSON object");
  }

  if (typeof record.version !== "string" || typeof record.requestId !== "string") {
    throw new Error("WAUTH result envelope missing required fields: version/requestId");
  }

  return record as unknown as WauthResultEnvelope;
}

export function parseWauthMetadata(toolResult: JsonValue): WauthMetadataEnvelope {
  const content = resolveStructuredContent(toolResult);
  const record = asRecord(content);
  if (!record) {
    throw new Error("WAUTH metadata response must be a JSON object");
  }

  const requiredStringFields = ["issuer", "jwks_uri"] as const;
  for (const field of requiredStringFields) {
    if (typeof record[field] !== "string") {
      throw new Error(`WAUTH metadata missing required field: ${field}`);
    }
  }

  return record as unknown as WauthMetadataEnvelope;
}

export function extractArtifactRefs(envelope: WauthResultEnvelope): string[] {
  if (!Array.isArray(envelope.artifacts)) {
    return [];
  }

  return envelope.artifacts
    .map((artifact) => artifact.ref)
    .filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
}
