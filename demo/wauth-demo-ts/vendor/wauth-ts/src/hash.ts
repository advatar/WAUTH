import { createHash } from "node:crypto";
import type { JsonValue } from "./types.js";
import { canonicalizeJcs } from "./jcs.js";

export function computeActionHash(actionInstance: JsonValue): string {
  const canonical = canonicalizeJcs(actionInstance);
  const digest = createHash("sha256").update(canonical).digest("base64url");
  return `sha256:${digest}`;
}
