import type { JsonValue, MonotonicityResult } from "./types.js";
import { canonicalizeJcs } from "./jcs.js";

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: JsonValue, b: JsonValue): boolean {
  return canonicalizeJcs(a) === canonicalizeJcs(b);
}

function isSubsetArray(parent: JsonValue[], child: JsonValue[]): boolean {
  return child.every((candidate) => parent.some((entry) => deepEqual(entry, candidate)));
}

function compareConstraint(path: string, parent: JsonValue, child: JsonValue, reasons: string[]): void {
  if (parent === null || typeof parent === "string" || typeof parent === "boolean") {
    if (!deepEqual(parent, child)) {
      reasons.push(`${path}: value differs`);
    }
    return;
  }

  if (typeof parent === "number") {
    if (typeof child !== "number" || child !== parent) {
      reasons.push(`${path}: numeric value differs`);
    }
    return;
  }

  if (Array.isArray(parent)) {
    if (!Array.isArray(child) || !isSubsetArray(parent, child)) {
      reasons.push(`${path}: child list must be subset of parent list`);
    }
    return;
  }

  if (!isRecord(parent) || !isRecord(child)) {
    reasons.push(`${path}: incompatible structures`);
    return;
  }

  for (const [key, parentValue] of Object.entries(parent)) {
    if (!(key in child)) {
      reasons.push(`${path}.${key}: missing in child`);
      continue;
    }

    const childValue = child[key];

    if (key === "max" || key === "le") {
      if (typeof parentValue !== "number" || typeof childValue !== "number" || childValue > parentValue) {
        reasons.push(`${path}.${key}: child must be <= parent`);
      }
      continue;
    }

    if (key === "min" || key === "ge") {
      if (typeof parentValue !== "number" || typeof childValue !== "number" || childValue < parentValue) {
        reasons.push(`${path}.${key}: child must be >= parent`);
      }
      continue;
    }

    if (key === "in") {
      if (!Array.isArray(parentValue) || !Array.isArray(childValue) || !isSubsetArray(parentValue, childValue)) {
        reasons.push(`${path}.${key}: child set must be subset of parent set`);
      }
      continue;
    }

    if (key === "currency") {
      if (typeof parentValue !== "string" || typeof childValue !== "string" || parentValue.toLowerCase() !== childValue.toLowerCase()) {
        reasons.push(`${path}.${key}: currency must match`);
      }
      continue;
    }

    compareConstraint(`${path}.${key}`, parentValue, childValue, reasons);
  }
}

export function checkEnvelopeMonotonicity(parent: JsonValue, child: JsonValue): MonotonicityResult {
  const reasons: string[] = [];

  if (!isRecord(parent) || !isRecord(child)) {
    return { ok: false, reasons: ["parent and child envelopes must be objects"] };
  }

  if (typeof parent.version === "string" && typeof child.version === "string" && parent.version !== child.version) {
    reasons.push("version mismatch");
  }

  if (!isRecord(parent.constraints) || !isRecord(child.constraints)) {
    reasons.push("constraints must be objects");
  } else {
    for (const [key, parentConstraint] of Object.entries(parent.constraints)) {
      if (!(key in child.constraints)) {
        reasons.push(`constraints.${key}: missing in child`);
        continue;
      }
      compareConstraint(`constraints.${key}`, parentConstraint, child.constraints[key], reasons);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
