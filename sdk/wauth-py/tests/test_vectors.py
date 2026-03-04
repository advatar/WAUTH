import json
import pathlib
import sys
import unittest

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

ROOT = pathlib.Path(__file__).resolve().parents[3]
PY_SRC = ROOT / "sdk" / "wauth-py" / "src"
if str(PY_SRC) not in sys.path:
    sys.path.insert(0, str(PY_SRC))

from wauth_sdk import (  # noqa: E402
    WauthSchemaRegistry,
    WauthJwksCache,
    build_wauth_get,
    build_wauth_metadata,
    build_wauth_request,
    canonicalize_jcs,
    check_envelope_monotonicity,
    compute_action_hash,
    decode_jwt_header,
    decode_jwt_payload,
    evaluate_execution_budget,
    evaluate_instruction_source,
    evaluate_multi_agent_trust,
    evaluate_postcondition,
    evaluate_requester_continuity,
    evaluate_risk_policy,
    extract_artifact_refs,
    extract_elicitations,
    parse_wauth_metadata,
    parse_wauth_result_envelope,
    verify_capability_jwt_with_jwks,
    verify_jwt_with_jwks,
    validate_capability_claims,
    validate_provenance_chain,
    well_known_wauth_config_url,
)


def load_json(relative_path: str):
    with open(ROOT / relative_path, "r", encoding="utf-8") as f:
        return json.load(f)


class TestVectors(unittest.TestCase):
    def test_action_hash_vector(self):
        vector = load_json("test_vectors/v0.4/wauth_action_hash_vector_01.json")
        self.assertEqual(canonicalize_jcs(vector["action_instance"]), vector["jcs"])
        self.assertEqual(compute_action_hash(vector["action_instance"]), vector["action_hash"])

    def test_envelope_monotonicity(self):
        vector = load_json("test_vectors/v0.4/wauth_envelope_monotonicity_vectors_01.json")
        for case in vector["cases"]:
            ok, _ = check_envelope_monotonicity(case["parent"], case["child"])
            self.assertEqual("pass" if ok else "fail", case["expect"])

    def test_requester_continuity(self):
        vector = load_json("test_vectors/v0.5/wauth_requester_continuity_vector_01.json")
        self.assertEqual(evaluate_requester_continuity(vector), vector["expected"])

    def test_instruction_source(self):
        vector = load_json("test_vectors/v0.5/wauth_instruction_source_vector_01.json")
        self.assertEqual(evaluate_instruction_source(vector), vector["expected_authority_class"])

    def test_execution_budget(self):
        vector = load_json("test_vectors/v0.5/wauth_exec_budget_vector_01.json")
        self.assertEqual(evaluate_execution_budget(vector), vector["expected"])

    def test_postcondition(self):
        vector = load_json("test_vectors/v0.5/wauth_postcondition_vector_01.json")
        self.assertEqual(evaluate_postcondition(vector), vector["expected_status"])

    def test_provenance_chain(self):
        vector = load_json("test_vectors/v0.5/wauth_provenance_chain_vector_01.json")
        self.assertTrue(validate_provenance_chain(vector))

    def test_risk_policy(self):
        vector = load_json("test_vectors/v0.5/wauth_risk_policy_vector_01.json")
        self.assertEqual(evaluate_risk_policy(vector), vector["expected_decision"])

    def test_multi_agent_trust(self):
        vector = load_json("test_vectors/v0.5/wauth_multi_agent_trust_vector_01.json")
        self.assertEqual(evaluate_multi_agent_trust(vector), vector["expected"])

    def test_mcp_request_builder(self):
        req = build_wauth_request({"walletIntent": {"profile": "x"}}, request_id="req-1")
        self.assertEqual(req["name"], "aaif.wauth.request")
        self.assertEqual(req["arguments"]["requestId"], "req-1")

    def test_mcp_get_metadata_builders(self):
        get_req = build_wauth_get("artifact://cap/123")
        metadata_req = build_wauth_metadata()
        self.assertEqual(get_req, {"name": "aaif.wauth.get", "arguments": {"ref": "artifact://cap/123"}})
        self.assertEqual(metadata_req, {"name": "aaif.wauth.metadata", "arguments": {}})

    def test_parse_result_and_metadata_envelopes(self):
        result = parse_wauth_result_envelope(
            {
                "structuredContent": {
                    "version": "0.1",
                    "requestId": "req-1",
                    "artifacts": [
                        {"kind": "WAUTH-CAP", "format": "jwt", "ref": "artifact://cap/123"},
                        {"kind": "WAUTH-REC", "format": "json", "inline": {"event_id": "evt-1"}},
                    ],
                }
            }
        )
        self.assertEqual(result["requestId"], "req-1")
        self.assertEqual(extract_artifact_refs(result), ["artifact://cap/123"])

        metadata = parse_wauth_metadata(
            {
                "structuredContent": {
                    "issuer": "https://wauth.example",
                    "jwks_uri": "https://wauth.example/jwks",
                    "wauth_versions_supported": ["0.5.1"],
                    "intent_versions_supported": ["0.2"],
                    "profiles_supported": ["wauth-rp-reqsig/v0.1"],
                    "formats_supported": ["jwt"],
                    "mcp": {
                        "tool_namespaces_supported": ["aaif.wauth"],
                        "tools_supported": ["aaif.wauth.request", "aaif.wauth.get", "aaif.wauth.metadata"],
                    },
                }
            }
        )
        self.assertEqual(metadata["issuer"], "https://wauth.example")
        self.assertEqual(metadata["jwks_uri"], "https://wauth.example/jwks")

    def test_elicitation_extraction(self):
        payload = {
            "code": -32042,
            "data": {
                "elicitations": [{"mode": "url", "url": "https://issuer.example/approve"}]
            },
        }
        self.assertEqual(len(extract_elicitations(payload)), 1)

    def test_capability_claim_validation(self):
        result = validate_capability_claims(
            claims={
                "aud": "https://rp.example/api/payments",
                "exp": 2000000000,
                "iat": 1999999000,
                "jti": "jti-1",
                "action_hash": "sha256:test",
            },
            expected_audience="https://rp.example/api/payments",
            expected_action_hash="sha256:test",
            now_epoch_seconds=1999999500,
        )
        self.assertTrue(result.ok)
        self.assertEqual(result.replay_key, "jti-1")

    def test_well_known_url_helper(self):
        self.assertEqual(
            well_known_wauth_config_url("https://issuer.example/"),
            "https://issuer.example/.well-known/aaif-wauth-configuration",
        )

    def test_schema_validation_with_refs(self):
        registry = WauthSchemaRegistry(ROOT / "schemas")
        example = load_json("examples/rp-wauth-required-example.json")
        result = registry.validate_by_file_name("wauth-required.v0.2.schema.json", example)
        self.assertTrue(result.ok, msg="; ".join(result.errors))

    def test_schema_validation_rejects_bad_payload(self):
        registry = WauthSchemaRegistry(ROOT / "schemas")
        result = registry.validate_by_file_name("wauth-agent-link.v0.1.schema.json", {"relation": "peer"})
        self.assertFalse(result.ok)

    def test_schema_example_map_pairs(self):
        registry = WauthSchemaRegistry(ROOT / "schemas")
        mapping = load_json("sdk/wauth-conformance/schema-example-map.json")
        for pair in mapping["pairs"]:
            example = load_json(pair["example"])
            schema_file_name = pair["schema"].split("/")[-1]
            result = registry.validate_by_file_name(schema_file_name, example)
            self.assertTrue(
                result.ok,
                msg=f"{pair['example']} vs {pair['schema']}: {'; '.join(result.errors)}",
            )

    def test_jwt_jwks_verification(self):
        now = 1_700_000_000
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
        public_jwk["kid"] = "py-test-rsa-key"
        public_jwk["alg"] = "RS256"
        public_jwk["use"] = "sig"
        jwks = {"keys": [public_jwk]}

        token = jwt.encode(
            {
                "iss": "https://wauth.example",
                "aud": "https://rp.example/api/payments",
                "iat": now,
                "exp": now + 600,
                "jti": "cap-jti-1",
                "action_hash": "sha256:test",
            },
            private_key,
            algorithm="RS256",
            headers={"kid": "py-test-rsa-key", "typ": "JWT"},
        )

        raw_result = verify_jwt_with_jwks(
            token=token,
            jwks=jwks,
            expected_issuer="https://wauth.example",
            expected_audience="https://rp.example/api/payments",
            now_epoch_seconds=now + 10,
        )
        self.assertTrue(raw_result.ok, msg="; ".join(raw_result.errors))

        result = verify_capability_jwt_with_jwks(
            token=token,
            jwks=jwks,
            expected_issuer="https://wauth.example",
            expected_audience="https://rp.example/api/payments",
            expected_action_hash="sha256:test",
            now_epoch_seconds=now + 10,
        )
        self.assertTrue(result.ok, msg="; ".join(result.errors))
        self.assertEqual(result.replay_key, "cap-jti-1")

        header = decode_jwt_header(token)
        payload = decode_jwt_payload(token)
        self.assertEqual(header["kid"], "py-test-rsa-key")
        self.assertEqual(payload["iss"], "https://wauth.example")

    def test_jwt_verification_fails_for_tampered_token(self):
        now = 1_700_000_000
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
        public_jwk["kid"] = "py-test-rsa-key-2"
        public_jwk["alg"] = "RS256"
        jwks = {"keys": [public_jwk]}

        token = jwt.encode(
            {
                "iss": "https://wauth.example",
                "aud": "https://rp.example/api/payments",
                "iat": now,
                "exp": now + 600,
                "jti": "cap-jti-2",
                "action_hash": "sha256:test",
            },
            private_key,
            algorithm="RS256",
            headers={"kid": "py-test-rsa-key-2", "typ": "JWT"},
        )
        header_part, payload_part, signature_part = token.split(".")
        tampered_signature = f"{'a' if signature_part[0] != 'a' else 'b'}{signature_part[1:]}"
        tampered = f"{header_part}.{payload_part}.{tampered_signature}"

        result = verify_jwt_with_jwks(
            token=tampered,
            jwks=jwks,
            expected_issuer="https://wauth.example",
            expected_audience="https://rp.example/api/payments",
            now_epoch_seconds=now + 10,
        )
        self.assertFalse(result.ok)
        self.assertTrue(any("JWT verification failed" in err for err in result.errors))

    def test_jwks_cache_fetch_and_refresh(self):
        calls = []
        now = 1_700_000_000
        state = {"now": now, "jwks_version": 0}

        def fetch_json(url: str):
            calls.append(url)
            if url.endswith("/.well-known/aaif-wauth-configuration"):
                return {
                    "issuer": "https://wauth.example",
                    "jwks_uri": "https://wauth.example/jwks",
                    "wauth_versions_supported": ["0.5.1"],
                    "intent_versions_supported": ["0.2"],
                    "profiles_supported": [],
                    "formats_supported": ["jwt"],
                    "mcp": {
                        "tool_namespaces_supported": ["aaif.wauth"],
                        "tools_supported": ["aaif.wauth.request"],
                    },
                }

            state["jwks_version"] += 1
            if state["jwks_version"] == 1:
                return {"keys": [{"kid": "old", "kty": "RSA", "e": "AQAB", "n": "abc"}]}
            return {"keys": [{"kid": "new", "kty": "RSA", "e": "AQAB", "n": "def"}]}

        cache = WauthJwksCache(
            fetch_json=fetch_json,
            ttl_seconds=300,
            now_epoch_seconds=lambda: state["now"],
        )

        jwks = cache.get_for_issuer("https://wauth.example")
        self.assertEqual(jwks["keys"][0]["kid"], "old")
        self.assertEqual(len(calls), 2)

        # Cached call should not fetch again.
        _ = cache.get_for_issuer("https://wauth.example")
        self.assertEqual(len(calls), 2)

        # Missing kid triggers one refresh.
        _, key = cache.get_for_kid("https://wauth.example", "new")
        self.assertIsNotNone(key)
        self.assertEqual(key["kid"], "new")
        self.assertEqual(len(calls), 4)


if __name__ == "__main__":
    unittest.main()
