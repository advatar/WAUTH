use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use wauth_rs::{
    canonicalize_jcs, check_envelope_monotonicity, compute_action_hash, evaluate_execution_budget,
    evaluate_instruction_source, evaluate_multi_agent_trust, evaluate_postcondition,
    evaluate_requester_continuity, evaluate_risk_policy, validate_provenance_chain,
};

fn load_json(relative_path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("failed to resolve root path");
    let full_path = root.join(relative_path);
    let content = fs::read_to_string(full_path).expect("failed to read vector file");
    serde_json::from_str(&content).expect("failed to parse vector")
}

#[test]
fn action_hash_vector() {
    let vector = load_json("test_vectors/v0.4/wauth_action_hash_vector_01.json");
    let canonical = canonicalize_jcs(&vector["action_instance"]).expect("jcs failed");
    assert_eq!(canonical, vector["jcs"].as_str().unwrap());

    let hash = compute_action_hash(&vector["action_instance"]).expect("hash failed");
    assert_eq!(hash, vector["action_hash"].as_str().unwrap());
}

#[test]
fn envelope_monotonicity_vectors() {
    let vector = load_json("test_vectors/v0.4/wauth_envelope_monotonicity_vectors_01.json");
    let cases = vector["cases"].as_array().unwrap();

    for case in cases {
        let result = check_envelope_monotonicity(&case["parent"], &case["child"]);
        let actual = if result.is_ok() { "pass" } else { "fail" };
        assert_eq!(actual, case["expect"].as_str().unwrap(), "case failed: {}", case["name"]);
    }
}

#[test]
fn requester_continuity_vector() {
    let vector = load_json("test_vectors/v0.5/wauth_requester_continuity_vector_01.json");
    let actual = evaluate_requester_continuity(&vector).unwrap();
    assert_eq!(actual, vector["expected"].as_str().unwrap());
}

#[test]
fn instruction_source_vector() {
    let vector = load_json("test_vectors/v0.5/wauth_instruction_source_vector_01.json");
    let actual = evaluate_instruction_source(&vector).unwrap();
    assert_eq!(actual, vector["expected_authority_class"].as_str().unwrap());
}

#[test]
fn execution_budget_vector() {
    let vector = load_json("test_vectors/v0.5/wauth_exec_budget_vector_01.json");
    let actual = evaluate_execution_budget(&vector).unwrap();
    assert_eq!(actual, vector["expected"].as_str().unwrap());
}

#[test]
fn postcondition_vector() {
    let vector = load_json("test_vectors/v0.5/wauth_postcondition_vector_01.json");
    let actual = evaluate_postcondition(&vector).unwrap();
    assert_eq!(actual, vector["expected_status"].as_str().unwrap());
}

#[test]
fn provenance_chain_vector() {
    let vector = load_json("test_vectors/v0.5/wauth_provenance_chain_vector_01.json");
    let actual = validate_provenance_chain(&vector).unwrap();
    assert!(actual);
}

#[test]
fn risk_policy_vector() {
    let vector = load_json("test_vectors/v0.5/wauth_risk_policy_vector_01.json");
    let actual = evaluate_risk_policy(&vector).unwrap();
    assert_eq!(actual, vector["expected_decision"].as_str().unwrap());
}

#[test]
fn multi_agent_trust_vector() {
    let vector = load_json("test_vectors/v0.5/wauth_multi_agent_trust_vector_01.json");
    let actual = evaluate_multi_agent_trust(&vector).unwrap();
    assert_eq!(actual, vector["expected"].as_str().unwrap());
}
