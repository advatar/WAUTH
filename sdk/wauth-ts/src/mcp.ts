import type { JsonValue } from "./types.js";

export interface WauthToolCall {
  name: string;
  arguments: Record<string, JsonValue>;
}

export interface BuildWauthRequestOptions {
  requestId?: string;
  namespace?: "aaif.wauth" | "aaif.pwma";
}

export interface BuildWauthGetOptions {
  namespace?: "aaif.wauth" | "aaif.pwma";
}

export interface Oid4vpRequestArgs {
  oid4vpRequest: JsonValue;
  mode?: "return" | "direct_post";
  response_uri?: string;
}

export interface Oid4vciRequestArgs {
  oid4vciOffer: JsonValue;
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

export interface ParseWauthGetArtifactOptions {
  expectedKind?: string;
  expectedFormat?: string;
}

function asRecord(value: JsonValue): Record<string, JsonValue> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function isStringArray(value: JsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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
  options?: BuildWauthRequestOptions
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

export function buildWauthOid4vpRequest(
  args: Oid4vpRequestArgs,
  options?: BuildWauthRequestOptions
): WauthToolCall {
  const outArgs: Record<string, JsonValue> = {
    oid4vpRequest: args.oid4vpRequest
  };
  if (args.mode) {
    outArgs.mode = args.mode;
  }
  if (args.response_uri) {
    outArgs.response_uri = args.response_uri;
  }
  return buildWauthRequest(outArgs, options);
}

export function buildWauthOid4vciRequest(
  args: Oid4vciRequestArgs,
  options?: BuildWauthRequestOptions
): WauthToolCall {
  return buildWauthRequest({ oid4vciOffer: args.oid4vciOffer }, options);
}

export function buildWauthReqSigForwardingRequest(
  wauthRequired: Record<string, JsonValue>,
  actionInstance?: JsonValue,
  options?: BuildWauthRequestOptions
): WauthToolCall {
  const outArgs: Record<string, JsonValue> = { wauthRequired };
  if (typeof actionInstance !== "undefined") {
    outArgs.actionInstance = actionInstance;
  }
  return buildWauthRequest(outArgs, options);
}

export function buildWauthGet(
  ref: string,
  options?: BuildWauthGetOptions
): WauthToolCall {
  return {
    name: `${resolveNamespace(options?.namespace)}.get`,
    arguments: { ref }
  };
}

export function buildWauthGetFromArtifact(
  artifact: WauthArtifact,
  options?: BuildWauthGetOptions
): WauthToolCall {
  if (typeof artifact.ref !== "string" || artifact.ref.length === 0) {
    throw new Error("WAUTH artifact must include a non-empty ref");
  }
  return buildWauthGet(artifact.ref, options);
}

export function buildWauthMetadata(
  options?: BuildWauthGetOptions
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

export function parseWauthGetArtifact(
  toolResult: JsonValue,
  options?: ParseWauthGetArtifactOptions
): WauthArtifact {
  const content = resolveStructuredContent(toolResult);
  const record = asRecord(content);
  if (!record) {
    throw new Error("WAUTH get response must be a JSON object");
  }
  if (typeof record.kind !== "string" || typeof record.format !== "string") {
    throw new Error("WAUTH get response missing required fields: kind/format");
  }
  const hasInline = typeof record.inline !== "undefined";
  const hasRef = typeof record.ref === "string" && record.ref.length > 0;
  if (!hasInline && !hasRef) {
    throw new Error("WAUTH get response must include inline or ref");
  }
  if (options?.expectedKind && record.kind !== options.expectedKind) {
    throw new Error(`WAUTH get response kind mismatch: expected ${options.expectedKind}`);
  }
  if (options?.expectedFormat && record.format !== options.expectedFormat) {
    throw new Error(`WAUTH get response format mismatch: expected ${options.expectedFormat}`);
  }
  return record as unknown as WauthArtifact;
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

  const requiredStringArrays = [
    "wauth_versions_supported",
    "intent_versions_supported",
    "profiles_supported",
    "formats_supported"
  ] as const;
  for (const field of requiredStringArrays) {
    if (!isStringArray(record[field])) {
      throw new Error(`WAUTH metadata missing required string array: ${field}`);
    }
  }

  const mcp = asRecord(record.mcp);
  if (!mcp) {
    throw new Error("WAUTH metadata missing required field: mcp");
  }
  if (!isStringArray(mcp.tool_namespaces_supported)) {
    throw new Error("WAUTH metadata missing required string array: mcp.tool_namespaces_supported");
  }
  if (!isStringArray(mcp.tools_supported)) {
    throw new Error("WAUTH metadata missing required string array: mcp.tools_supported");
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

export function metadataSupportsTool(metadata: WauthMetadataEnvelope, toolName: string): boolean {
  return metadata.mcp.tools_supported.includes(toolName);
}

export function metadataSupportsNamespace(
  metadata: WauthMetadataEnvelope,
  namespace: string
): boolean {
  return metadata.mcp.tool_namespaces_supported.includes(namespace);
}

export function metadataSupportsProfile(metadata: WauthMetadataEnvelope, profile: string): boolean {
  return metadata.profiles_supported.includes(profile);
}

export function metadataSupportsFormat(metadata: WauthMetadataEnvelope, format: string): boolean {
  return metadata.formats_supported.includes(format);
}

export function metadataSupportsWauthVersion(
  metadata: WauthMetadataEnvelope,
  version: string
): boolean {
  return metadata.wauth_versions_supported.includes(version);
}
