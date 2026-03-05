import type { JsonValue } from "./types.js";

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeInternal(value: JsonValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("JCS does not allow non-finite numbers");
    }
    if (Object.is(value, -0)) {
      return "0";
    }
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeInternal(entry)).join(",")}]`;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    const encoded = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeInternal(value[key])}`);
    return `{${encoded.join(",")}}`;
  }

  throw new Error("Unsupported JSON value");
}

export function canonicalizeJcs(value: JsonValue): string {
  return canonicalizeInternal(value);
}
