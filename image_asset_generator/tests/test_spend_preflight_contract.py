import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import copy
import json
import unittest
from spend_preflight_contract import check, digest, instant, Rejected, unique_object

NOW = instant("2026-10-07T14:30:00Z")


def fixture():
    binding = {"repository": "synthetic/fixture", "sha": "a" * 40}
    job = {"schema_version": 1, "job_id": "synthetic-pilot", "provider": "fixture-only", "account_id": "synthetic-api", "operation": "refine", "model_version": "synthetic-v1", "owner_lane": "assets", "consumer": "fixture", "truth_class": "GENERIC", "rights_reviewed": True, "authority": binding, "input_sha256": ["b" * 64], "reuse_review": {"input_sha256": ["b" * 64], "decision": "MISSING_COMPONENT", "receipt": "synthetic-review"}, "acceptance": {"stage": "SPECIFIED", "criteria": "fixture exact bytes plus independent visual review", "verification": "synthetic fixture verifier"}, "expected_outputs": ["geometry", "receipt"], "budget": {"currency": "USD", "max_usd_micros": 2500000, "max_credits": 20, "units": 1, "max_retries": 1, "max_runtime_seconds": 60, "hard_stop_supported": True, "auto_top_up": False, "storage_egress_overhead_usd_micros": 100000, "rates": {"usd_micros_per_unit": 1000000, "credits_per_unit": 10, "receipt": "synthetic-price", "verified_at": "2026-10-07T14:00:00Z", "expires_at": "2026-10-07T15:00:00Z"}}, "attempts": []}
    job["approval"] = {"status": "APPROVED", "kind": "EXPLICIT_BOUNDED_SPEND", "receipt": "SYNTHETIC-NOT-AUTHORIZATION", "approver": "fixture", "issued_at": "2026-10-07T14:00:00Z", "expires_at": "2026-10-07T15:00:00Z", "job_digest": digest(job), "max_usd_micros": 2500000, "max_credits": 20}
    account = {"provider": "fixture-only", "account_id": "synthetic-api", "balance_type": "API", "trusted_readback": True, "available_usd_micros": 3000000, "available_credits": 30, "observed_at": "2026-10-07T14:00:00Z", "expires_at": "2026-10-07T15:00:00Z", "reservations": [{"job_id": "synthetic-pilot", "usd_micros": 2500000, "credits": 20}]}
    authority = {"binding": binding, "trusted_readback": True, "observed_at": "2026-10-07T14:00:00Z", "expires_at": "2026-10-07T15:00:00Z"}
    return job, account, authority


class AdmissionTests(unittest.TestCase):
    def reject(self, mutate, pattern):
        job, account, authority = fixture()
        mutate(job, account, authority)
        with self.assertRaisesRegex(Rejected, pattern):
            check(job, account, authority, NOW)

    def test_consistency_is_never_authorization(self):
        result = check(*fixture(), NOW)
        self.assertEqual(result["preflight"], "CONSISTENT")
        self.assertFalse(result["provider_call_authorized"])
        self.assertFalse(result["execution_performed"])

    def test_one_reconciled_corrective_retry(self):
        job, account, authority = fixture()
        job["attempts"] = [{"task_id": "prior-fixture", "status": "FAILED", "charges_reconciled": True, "corrective_action": "fix fixture input reader", "actual_usd_micros": 1000000, "actual_credits": 10}]
        self.assertEqual(check(job, account, authority, NOW)["preflight"], "CONSISTENT")

    def test_stale_source(self):
        self.reject(lambda j, a, s: s["binding"].update(sha="c" * 40), "not bound")
        # fixture aliases binding; mutation also changes job digest, still fails closed.
        job, account, authority = fixture()
        authority["binding"] = {**authority["binding"], "sha": "c" * 40}
        with self.assertRaisesRegex(Rejected, "stale"):
            check(job, account, authority, NOW)

    def test_expired_authority(self):
        self.reject(lambda j,a,s: s.update(expires_at="2026-10-07T14:30:00Z"), "expired")

    def test_missing_trust(self):
        self.reject(lambda j,a,s: s.update(trusted_readback=False), "trusted")

    def test_missing_approval(self):
        self.reject(lambda j,a,s: j.pop("approval"), "approval missing")

    def test_planning_budget_is_not_approval(self):
        self.reject(lambda j,a,s: j["approval"].update(kind="PLANNING_SCENARIO"), "approval missing")

    def test_changed_output_invalidates_approval(self):
        self.reject(lambda j,a,s: j["expected_outputs"].append("extra"), "not bound")

    def test_changed_model_invalidates_approval(self):
        self.reject(lambda j,a,s: j.update(model_version="different"), "not bound")

    def test_expired_approval(self):
        self.reject(lambda j,a,s: j["approval"].update(expires_at="2026-10-07T14:29:59Z"), "approval expired")

    def test_cap_differs(self):
        self.reject(lambda j,a,s: j["approval"].update(max_credits=21), "cap differs")

    def test_subscription_balance_is_not_api_balance(self):
        self.reject(lambda j,a,s: a.update(balance_type="SUBSCRIPTION"), "API balance")

    def test_expired_balance(self):
        self.reject(lambda j,a,s: a.update(expires_at="2026-10-07T14:00:00Z"), "balance snapshot")

    def test_other_account(self):
        self.reject(lambda j,a,s: a.update(account_id="foreign"), "account mismatch")

    def test_competing_reservations(self):
        self.reject(lambda j,a,s: a["reservations"].append({"job_id":"other","usd_micros":1000000,"credits":11}), "exceed available")

    def test_reservation_not_exact(self):
        self.reject(lambda j,a,s: a["reservations"][0].update(credits=19), "exact reservation")

    def test_duplicate_reservation(self):
        self.reject(lambda j,a,s: a["reservations"].append(copy.deepcopy(a["reservations"][0])), "duplicate reservation")

    def test_ambiguous_attempt(self):
        for status in ["PENDING", "UNKNOWN", "SUCCEEDED", "CANCELLED"]:
            with self.subTest(status=status):
                self.reject(lambda j,a,s: j["attempts"].append({"task_id":"existing","status":status,"charges_reconciled":True}), "blocks duplicate")

    def test_unreconciled_charge(self):
        self.reject(lambda j,a,s: j["attempts"].append({"task_id":"failed","status":"FAILED","charges_reconciled":False}), "blocks duplicate")

    def test_spent_cap(self):
        self.reject(lambda j,a,s: j["attempts"].append({"task_id":"failed","status":"FAILED","charges_reconciled":True,"corrective_action":"fixed","actual_usd_micros":2000000,"actual_credits":10}), "remaining USD")

    def test_second_corrective_retry_blocked(self):
        self.reject(lambda j,a,s: j["attempts"].extend([{},{}]), "retry limit reached")

    def test_unlimited_retries(self):
        self.reject(lambda j,a,s: j["budget"].update(max_retries=2), "at most one")

    def test_zero_unknown_rate(self):
        self.reject(lambda j,a,s: j["budget"]["rates"].update(usd_micros_per_unit=0,credits_per_unit=0), "rate cannot")

    def test_expired_price(self):
        self.reject(lambda j,a,s: j["budget"]["rates"].update(expires_at="2026-10-07T14:00:00Z"), "pricing expired")

    def test_overhead_exceeds_cap(self):
        self.reject(lambda j,a,s: j["budget"].update(storage_egress_overhead_usd_micros=1000000), "worst-case USD")

    def test_credits_exceed_cap(self):
        self.reject(lambda j,a,s: j["budget"]["rates"].update(credits_per_unit=11), "worst-case credits")

    def test_no_hard_stop(self):
        self.reject(lambda j,a,s: j["budget"].update(hard_stop_supported=False), "hard stop")

    def test_auto_top_up(self):
        self.reject(lambda j,a,s: j["budget"].update(auto_top_up=True), "top-up")

    def test_boolean_is_not_money(self):
        self.reject(lambda j,a,s: j["budget"].update(max_usd_micros=True), "invalid USD")

    def test_boolean_schema_rejected(self):
        self.reject(lambda j,a,s: j.update(schema_version=True), "schema version")

    def test_boolean_approved_cap_rejected(self):
        self.reject(lambda j,a,s: j["approval"].update(max_credits=True), "approved credit cap")

    def test_float_approved_cap_rejected(self):
        self.reject(lambda j,a,s: j["approval"].update(max_usd_micros=2500000.0), "approved USD cap")

    def test_negative_money(self):
        self.reject(lambda j,a,s: a.update(available_usd_micros=-1), "available USD")

    def test_rights_missing(self):
        self.reject(lambda j,a,s: j.update(rights_reviewed=False), "rights")

    def test_no_reuse_inspection(self):
        self.reject(lambda j,a,s: j["reuse_review"].update(decision="NOT_CHECKED"), "reuse")

    def test_generated_stage_cannot_open_generation(self):
        self.reject(lambda j,a,s: j["acceptance"].update(stage="GENERATED_CHALLENGER"), "already generated")

    def test_factual_source_cannot_be_generated(self):
        self.reject(lambda j,a,s: j.update(truth_class="RECORDED_SOURCE_TRUTH"), "derivative truth")

    def test_timezone_required(self):
        with self.assertRaises(Rejected):
            instant("2026-10-07T14:00:00")

    def test_duplicate_json_keys(self):
        with self.assertRaisesRegex(Rejected, "duplicate"):
            json.loads('{"max":1,"max":1000}', object_pairs_hook=unique_object)


if __name__ == "__main__":
    unittest.main()
