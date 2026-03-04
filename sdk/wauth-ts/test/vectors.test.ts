import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalizeJcs,
  checkEnvelopeMonotonicity,
  computeActionHash,
  evaluateExecutionBudget,
  evaluateInstructionSource,
  evaluateMultiAgentTrust,
  evaluatePostcondition,
  evaluateRequesterContinuity,
  evaluateRiskPolicy,
  validateProvenanceChain
} from "../src/index.js";

function loadJson(pathFromRepoRoot: string): any {
  const absolute = resolve(process.cwd(), "../..", pathFromRepoRoot);
  return JSON.parse(readFileSync(absolute, "utf8"));
}

describe("wauth-ts vectors", () => {
  it("matches action hash vector", () => {
    const vector = loadJson("test_vectors/v0.4/wauth_action_hash_vector_01.json");
    expect(canonicalizeJcs(vector.action_instance)).toBe(vector.jcs);
    expect(computeActionHash(vector.action_instance)).toBe(vector.action_hash);
  });

  it("evaluates envelope monotonicity vectors", () => {
    const vector = loadJson("test_vectors/v0.4/wauth_envelope_monotonicity_vectors_01.json");
    for (const testCase of vector.cases) {
      const result = checkEnvelopeMonotonicity(testCase.parent, testCase.child);
      expect(result.ok ? "pass" : "fail").toBe(testCase.expect);
    }
  });

  it("evaluates requester continuity vector", () => {
    const vector = loadJson("test_vectors/v0.5/wauth_requester_continuity_vector_01.json");
    expect(evaluateRequesterContinuity(vector)).toBe(vector.expected);
  });

  it("evaluates instruction source vector", () => {
    const vector = loadJson("test_vectors/v0.5/wauth_instruction_source_vector_01.json");
    expect(evaluateInstructionSource(vector)).toBe(vector.expected_authority_class);
  });

  it("evaluates execution budget vector", () => {
    const vector = loadJson("test_vectors/v0.5/wauth_exec_budget_vector_01.json");
    expect(evaluateExecutionBudget(vector)).toBe(vector.expected);
  });

  it("evaluates postcondition vector", () => {
    const vector = loadJson("test_vectors/v0.5/wauth_postcondition_vector_01.json");
    expect(evaluatePostcondition(vector)).toBe(vector.expected_status);
  });

  it("evaluates provenance chain vector", () => {
    const vector = loadJson("test_vectors/v0.5/wauth_provenance_chain_vector_01.json");
    expect(validateProvenanceChain(vector)).toBe(true);
  });

  it("evaluates risk policy vector", () => {
    const vector = loadJson("test_vectors/v0.5/wauth_risk_policy_vector_01.json");
    expect(evaluateRiskPolicy(vector)).toBe(vector.expected_decision);
  });

  it("evaluates multi-agent trust vector", () => {
    const vector = loadJson("test_vectors/v0.5/wauth_multi_agent_trust_vector_01.json");
    expect(evaluateMultiAgentTrust(vector)).toBe(vector.expected);
  });
});
