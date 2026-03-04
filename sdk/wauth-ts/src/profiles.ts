import type { JsonValue } from "./types.js";

function asRecord(value: JsonValue): Record<string, JsonValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  throw new Error("Expected object");
}

export function evaluateRequesterContinuity(input: JsonValue): string {
  const record = asRecord(input);
  return record.continuity === "intact" ? "allow" : "step_up_or_deny";
}

export function evaluateInstructionSource(input: JsonValue): string {
  const record = asRecord(input);
  const mutability = record.mutability;
  const reviewState = record.review_state;
  if (mutability === "externally_editable" || reviewState !== "reviewed") {
    return "data";
  }
  return "instruction";
}

export function evaluateExecutionBudget(input: JsonValue): string {
  const record = asRecord(input);
  const mayPersist = record.may_create_persistent_process;
  const processType = record.requested_process_type;
  const persistentTypes = new Set(["cron", "daemon", "monitor", "recurring_workflow"]);
  if (mayPersist === false && typeof processType === "string" && persistentTypes.has(processType)) {
    return "deny";
  }
  return "allow";
}

export function evaluatePostcondition(input: JsonValue): string {
  const record = asRecord(input);
  const claimed = record.claimed_success === true;
  const verified = record.verified_success === true;
  if (claimed && !verified) {
    return "unverified_or_failed";
  }
  return verified ? "verified" : "unknown";
}

export function validateProvenanceChain(input: JsonValue): boolean {
  const record = asRecord(input);
  const events = record.events;
  if (!Array.isArray(events) || events.length === 0) {
    return false;
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = asRecord(events[i] as JsonValue);
    const prev = event.prev_event_hash;
    if (i === 0) {
      if (prev !== null) {
        return false;
      }
      continue;
    }

    const previous = asRecord(events[i - 1] as JsonValue);
    if (prev !== previous.event_hash) {
      return false;
    }
  }

  return true;
}

export function evaluateRiskPolicy(input: JsonValue): string {
  const record = asRecord(input);
  const risk = asRecord(record.risk as JsonValue);
  return risk.recommended_action === "step_up" ? "wauth_required" : "permit";
}

export function evaluateMultiAgentTrust(input: JsonValue): string {
  const record = asRecord(input);
  const basis = record.assertion_basis;
  const independent = record.verified_independently === true;
  if (!independent && basis === "shared_channel") {
    return "insufficient_without_external_anchor";
  }
  return "sufficient";
}
