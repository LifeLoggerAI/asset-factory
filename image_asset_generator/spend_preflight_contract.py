"""Offline, fail-closed paid-job preflight. Never executes or authorizes a provider call."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


class Rejected(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise Rejected(reason)


def integer(value, name, minimum=0):
    require(type(value) is int and value >= minimum, f"invalid {name}")
    return value


def instant(value):
    require(isinstance(value, str), "timestamp missing")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Rejected("invalid timestamp") from exc
    require(parsed.tzinfo is not None, "timestamp requires timezone")
    return parsed


def sha(value, length=64):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{" + str(length) + r"}", value), "invalid digest")
    return value


def text(value, name):
    require(isinstance(value, str) and value.strip(), f"missing {name}")
    return value


def digest(job):
    # Approval and mutable attempt history are excluded; all execution parameters are bound.
    bound = {k: v for k, v in job.items() if k not in {"approval", "attempts"}}
    return hashlib.sha256(json.dumps(bound, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def check(job, account, authority, now):
    require(isinstance(job, dict) and isinstance(account, dict) and isinstance(authority, dict), "invalid envelope")
    require(integer(job.get("schema_version"), "schema version", 1) == 1, "unsupported schema")
    job_id = text(job.get("job_id"), "job id")
    provider = text(job.get("provider"), "provider")
    account_id = text(job.get("account_id"), "account id")
    text(job.get("operation"), "operation")
    text(job.get("model_version"), "model version")
    text(job.get("owner_lane"), "owner lane")
    text(job.get("consumer"), "consumer")
    require(job.get("truth_class") in {"GENERIC", "INTERPRETIVE", "SPATIALLY_RECONSTRUCTABLE"}, "invalid derivative truth class")
    require(job.get("rights_reviewed") is True, "rights not reviewed")
    binding = job.get("authority", {})
    require(binding == authority.get("binding"), "stale or different source authority")
    sha(binding.get("sha"), 40)
    text(binding.get("repository"), "repository")
    require(authority.get("trusted_readback") is True, "authority requires trusted readback")
    require(instant(authority.get("observed_at")) <= now < instant(authority.get("expires_at")), "authority snapshot expired or future")
    inputs = job.get("input_sha256")
    require(isinstance(inputs, list) and inputs and len(inputs) == len(set(inputs)), "missing or duplicate inputs")
    for item in inputs:
        sha(item)
    reuse = job.get("reuse_review", {})
    require(reuse.get("input_sha256") == inputs, "reuse review not bound to inputs")
    require(reuse.get("decision") in {"MISSING_COMPONENT", "REWORK_EXISTING"}, "reuse inspection incomplete or accepted output exists")
    text(reuse.get("receipt"), "reuse receipt")
    acceptance = job.get("acceptance", {})
    text(acceptance.get("criteria"), "acceptance criteria")
    text(acceptance.get("verification"), "verification method")
    require(acceptance.get("stage") == "SPECIFIED", "output already generated or stage ambiguous")
    expected = job.get("expected_outputs")
    require(isinstance(expected, list) and expected and all(isinstance(x, str) and x.strip() for x in expected), "outputs missing")
    require(len(expected) == len(set(expected)), "duplicate outputs")
    budget = job.get("budget", {})
    require(budget.get("currency") == "USD", "unsupported currency")
    cap_usd = integer(budget.get("max_usd_micros"), "USD cap", 1)
    cap_credits = integer(budget.get("max_credits"), "credit cap")
    units = integer(budget.get("units"), "units", 1)
    retries = integer(budget.get("max_retries"), "retry limit")
    require(retries <= 1, "pilot permits at most one corrective retry")
    integer(budget.get("max_runtime_seconds"), "runtime limit", 1)
    require(budget.get("hard_stop_supported") is True and budget.get("auto_top_up") is False, "hard stop or top-up policy missing")
    rates = budget.get("rates", {})
    integer(rates.get("usd_micros_per_unit"), "USD unit rate")
    integer(rates.get("credits_per_unit"), "credit unit rate")
    overhead = integer(budget.get("storage_egress_overhead_usd_micros"), "overhead")
    require(units * (retries + 1) * rates["usd_micros_per_unit"] + overhead <= cap_usd, "worst-case USD exceeds cap")
    require(units * (retries + 1) * rates["credits_per_unit"] <= cap_credits, "worst-case credits exceed cap")
    require(rates["usd_micros_per_unit"] > 0 or rates["credits_per_unit"] > 0, "paid rate cannot be unknown or zero")
    text(rates.get("receipt"), "pricing receipt")
    require(instant(rates.get("verified_at")) <= now < instant(rates.get("expires_at")), "pricing expired or future")
    require(account.get("provider") == provider and account.get("account_id") == account_id, "account mismatch")
    require(account.get("balance_type") == "API" and account.get("trusted_readback") is True, "API balance not verified")
    require(instant(account.get("observed_at")) <= now < instant(account.get("expires_at")), "balance snapshot expired or future")
    available_usd = integer(account.get("available_usd_micros"), "available USD")
    available_credits = integer(account.get("available_credits"), "available credits")
    reservations = account.get("reservations")
    require(isinstance(reservations, list), "reservations missing")
    ids = set()
    own = None
    total_usd = total_credits = 0
    for item in reservations:
        rid = text(item.get("job_id"), "reserved job")
        require(rid not in ids, "duplicate reservation")
        ids.add(rid)
        total_usd += integer(item.get("usd_micros"), "reserved USD")
        total_credits += integer(item.get("credits"), "reserved credits")
        if rid == job_id:
            own = item
    require(own is not None and own["usd_micros"] == cap_usd and own["credits"] == cap_credits, "exact reservation missing")
    require(total_usd <= available_usd and total_credits <= available_credits, "reservations exceed available balance")
    attempts = job.get("attempts")
    require(isinstance(attempts, list) and len(attempts) <= retries, "retry limit reached or history missing")
    attempt_ids = set()
    for item in attempts:
        tid = text(item.get("task_id"), "prior task id")
        require(tid not in attempt_ids, "duplicate task history")
        attempt_ids.add(tid)
        require(item.get("status") == "FAILED" and item.get("charges_reconciled") is True, "pending, ambiguous or successful attempt blocks duplicate")
        text(item.get("corrective_action"), "corrective action")
        integer(item.get("actual_usd_micros"), "actual USD")
        integer(item.get("actual_credits"), "actual credits")
    spent_usd = sum(a["actual_usd_micros"] for a in attempts)
    spent_credits = sum(a["actual_credits"] for a in attempts)
    require(spent_usd + units * rates["usd_micros_per_unit"] + overhead <= cap_usd, "remaining USD insufficient")
    require(spent_credits + units * rates["credits_per_unit"] <= cap_credits, "remaining credits insufficient")
    approval = job.get("approval", {})
    require(approval.get("status") == "APPROVED" and approval.get("kind") == "EXPLICIT_BOUNDED_SPEND", "explicit spend approval missing")
    text(approval.get("receipt"), "approval receipt")
    text(approval.get("approver"), "approver")
    require(instant(approval.get("issued_at")) <= now < instant(approval.get("expires_at")), "approval expired or future")
    require(approval.get("job_digest") == digest(job), "approval not bound to exact job")
    approved_usd = integer(approval.get("max_usd_micros"), "approved USD cap", 1)
    approved_credits = integer(approval.get("max_credits"), "approved credit cap")
    require(approved_usd == cap_usd and approved_credits == cap_credits, "approved cap differs")
    return {"job_id": job_id, "preflight": "CONSISTENT", "job_digest": digest(job), "provider_call_authorized": False, "execution_performed": False, "limitation": "Offline consistency only. Executor must authenticate approvals/readbacks, atomically reserve budget, revalidate authority and enforce provider limits."}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def read(path):
    return json.loads(Path(path).read_text(), object_pairs_hook=unique_object, parse_constant=lambda _: (_ for _ in ()).throw(Rejected("nonfinite JSON")))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("envelope", help="JSON containing job, account, authority")
    parser.add_argument("--now", help="timezone-aware deterministic test timestamp")
    args = parser.parse_args()
    try:
        envelope = read(args.envelope)
        result = check(envelope["job"], envelope["account"], envelope["authority"], instant(args.now) if args.now else datetime.now(timezone.utc))
    except (Rejected, ValueError, KeyError, TypeError, AttributeError, OSError) as exc:
        print(json.dumps({"preflight": "BLOCKED", "reason": str(exc), "provider_call_authorized": False, "execution_performed": False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
