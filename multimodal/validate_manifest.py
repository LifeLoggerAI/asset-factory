from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
REQUIRED_FIELDS = {
    "assetId", "version", "experienceArea", "lane", "assetType", "routes",
    "runtimeComponent", "creativeSpecification", "technicalBudget",
    "providerOrSource", "licensingStatus", "consentRequirements",
    "costCeilingUsd", "dependencies", "expectedOutputPath", "checksum",
    "provenance", "validationRequirements", "currentStatus", "reviewStatus",
    "promotionStatus", "releaseSha",
}
LANES = {"visual", "3d", "audio", "film", "accessibility", "runtime", "governance"}
COMPLETE_STATES = {"certified", "removed-from-scope"}


def fail(message: str) -> None:
    raise SystemExit(f"multimodal manifest invalid: {message}")


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "1.0.0":
        fail("unsupported schemaVersion")
    policy = data.get("releasePolicy", {})
    if policy.get("placeholdersAllowed") is not False:
        fail("placeholders must remain prohibited")
    assets = data.get("assets")
    if not isinstance(assets, list) or not assets:
        fail("assets must be a non-empty list")

    ids: set[str] = set()
    paths: set[str] = set()
    lane_counts = {lane: 0 for lane in LANES}
    complete = 0
    blocked = 0

    for index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            fail(f"asset {index} is not an object")
        missing = REQUIRED_FIELDS - set(asset)
        if missing:
            fail(f"asset {index} missing fields: {sorted(missing)}")
        asset_id = asset["assetId"]
        if asset_id in ids:
            fail(f"duplicate assetId {asset_id}")
        ids.add(asset_id)
        lane = asset["lane"]
        if lane not in LANES:
            fail(f"unsupported lane {lane}")
        lane_counts[lane] += 1
        output_path = asset["expectedOutputPath"]
        if output_path in paths:
            fail(f"duplicate output path {output_path}")
        paths.add(output_path)
        if asset["costCeilingUsd"] < 0:
            fail(f"negative cost ceiling for {asset_id}")
        if asset["currentStatus"] == "certified":
            required = [asset["checksum"], asset["releaseSha"], asset["provenance"]]
            if not all(required):
                fail(f"certified asset {asset_id} lacks checksum, provenance, or release SHA")
            if asset["promotionStatus"] != "merged" or asset["reviewStatus"] != "approved":
                fail(f"certified asset {asset_id} lacks approved merged promotion")
        if asset["currentStatus"] in COMPLETE_STATES:
            complete += 1
        if asset["currentStatus"] == "blocked":
            blocked += 1

    missing_lanes = sorted(lane for lane, count in lane_counts.items() if count == 0)
    if missing_lanes:
        fail(f"missing required lanes: {missing_lanes}")

    digest = hashlib.sha256(MANIFEST.read_bytes()).hexdigest()
    report = {
        "manifest": str(MANIFEST.relative_to(ROOT.parent)),
        "sha256": digest,
        "total": len(assets),
        "complete": complete,
        "blocked": blocked,
        "laneCounts": lane_counts,
        "releaseReady": complete == len(assets),
    }
    output = ROOT / "validation-report.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if report["releaseReady"]:
        print("release-ready manifest")
    else:
        print("release remains blocked")


if __name__ == "__main__":
    main()
