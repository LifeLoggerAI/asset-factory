#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "image_asset_generator"
OUT = ROOT / "artifacts/multimodal"
SPATIAL_REPO = "LifeLoggerAI/urai-spatial"
SPATIAL_REF = "main"
PROD_REPO = "LifeLoggerAI/UrAiProd"
PROD_REF = "78c61397f4732427bb1dd5628f221d153d8d9594"
CANONICAL_MANIFESTS = {
    "v1": "v1.manifest.json",
    "v2": "v2.manifest.json",
    "v3": "v3-canonical.manifest.json",
    "v4": "v4-canonical.manifest.json",
    "v5": "v5-canonical.manifest.json",
}


def canonical_manifest_name(version: str) -> str:
    try:
        return CANONICAL_MANIFESTS[version]
    except KeyError as error:
        raise ValueError(f"Unsupported visual manifest version: {version}") from error


def gh_json(endpoint: str) -> Any:
    run = subprocess.run(["gh", "api", endpoint], text=True, capture_output=True)
    if run.returncode:
        detail = "\n".join(part for part in (run.stdout.strip(), run.stderr.strip()) if part)
        raise RuntimeError(detail[-1200:] or f"GitHub API failed: {endpoint}")
    return json.loads(run.stdout)


def fetch_text(repo: str, path: str, ref: str) -> tuple[str, dict[str, Any]]:
    payload = gh_json(f"repos/{repo}/contents/{path}?ref={ref}")
    content = base64.b64decode(str(payload["content"])).decode("utf-8")
    return content, {
        "repository": repo,
        "path": path,
        "ref": ref,
        "blobSha": payload.get("sha"),
        "bytes": payload.get("size"),
    }


def remote_file(repo: str, path: str, ref: str) -> tuple[bool, dict[str, Any]]:
    run = subprocess.run(
        ["gh", "api", f"repos/{repo}/contents/{path}?ref={ref}"],
        text=True,
        capture_output=True,
    )
    if run.returncode:
        detail = "\n".join(part for part in (run.stdout.strip(), run.stderr.strip()) if part)
        if re.search(r"(?i)404|not found", detail):
            return False, {"lookupStatus": "not-found"}
        raise RuntimeError(f"GitHub lookup failed for {repo}/{path}: {detail[-1000:]}")
    payload = json.loads(run.stdout)
    return True, {
        "lookupStatus": "present",
        "blobSha": payload.get("sha"),
        "bytes": payload.get("size"),
        "downloadUrl": payload.get("download_url"),
    }


def public_repo_path(canonical: str) -> str:
    return f"urai-tier1/public/{canonical.lstrip('/')}"


def visual_entries() -> list[dict[str, Any]]:
    subprocess.run(["python", "check_canonical_version_contract.py"], cwd=GEN, check=True)
    versions = {"v1": 53, "v2": 80, "v3": 14, "v4": 39, "v5": 27}
    rows: list[dict[str, Any]] = []
    for version, expected in versions.items():
        manifest_name = canonical_manifest_name(version)
        path = GEN / "manifests/generated" / manifest_name
        entries = json.loads(path.read_text(encoding="utf-8"))
        if len(entries) != expected:
            raise ValueError(f"{version}: expected {expected} visual slots, found {len(entries)}")
        for entry in entries:
            canonical = str(entry.get("canonical_path") or "")
            if not canonical:
                template = str(entry.get("path_template") or "")
                canonical = re.sub(r"_\{size\}\.png$", ".webp", template)
            rows.append({
                "version": version,
                "family": str(entry.get("category") or "visual"),
                "identifier": str(entry["name"]),
                "mediaClass": "image",
                "canonicalPath": canonical,
                "runtimeConsumer": "LifeLoggerAI/urai-spatial",
                "requiredFormat": "webp",
                "technicalContract": {
                    "sizes": entry.get("sizes"),
                    "aspectRatio": entry.get("aspect_ratio"),
                    "alpha": entry.get("alpha"),
                    "quality": entry.get("quality"),
                },
                "sourceAuthority": f"LifeLoggerAI/asset-factory:{path.relative_to(ROOT).as_posix()}",
                "claimGate": entry.get("claim_gate"),
            })
    return rows


def launch_critical_entries() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    text, authority = fetch_text(
        SPATIAL_REPO,
        "operations/assets/launch-critical-assets.json",
        SPATIAL_REF,
    )
    payload = json.loads(text)
    rows = []
    for entry in payload.get("assets", []):
        fixed = str(entry["fixedPath"])
        canonical = fixed.removeprefix("urai-tier1/public/")
        kind = str(entry["kind"])
        media = {
            "model": "model-3d",
            "hdr": "environment-hdr",
            "texture": "texture",
            "material-pack": "material",
            "loading-sequence": "animation",
            "audio": "audio",
        }.get(kind, kind)
        contract = {key: value for key, value in entry.items() if key not in {
            "id", "kind", "fixedPath", "targetRoutes", "source", "license", "releaseState", "fallback"
        }}
        rows.append({
            "version": "v1",
            "family": "launch-critical",
            "identifier": entry["id"],
            "mediaClass": media,
            "canonicalPath": canonical,
            "runtimeConsumer": entry.get("targetRoutes", []),
            "requiredFormat": Path(canonical).suffix.lstrip("."),
            "technicalContract": contract,
            "sourceAuthority": authority,
            "declaredSource": entry.get("source"),
            "license": entry.get("license"),
            "declaredState": entry.get("releaseState"),
            "fallback": entry.get("fallback"),
        })
    return rows, authority


def xr_entries() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    text, authority = fetch_text(
        SPATIAL_REPO,
        "urai-tier1/src/spatial/assets/xrAssets.ts",
        SPATIAL_REF,
    )
    pattern = re.compile(
        r"asset\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'(?:,\s*'([^']+)')?(?:,\s*(true|false))?\)"
    )
    rows = []
    media_by_tier = {
        "model": "model-3d",
        "audio": "audio",
        "haptics": "haptic",
        "performance": "performance-package",
        "proof": "proof",
        "input": "image",
        "comfort": "image",
        "ar-tabletop": "image",
        "mobile-spatial": "image",
        "xr-entry": "image",
    }
    for tier, identifier, suffix, purpose, claim_gate, proof_required in pattern.findall(text):
        canonical = f"assets/urai/xr{suffix}"
        rows.append({
            "version": "v3",
            "family": f"xr-{tier}",
            "identifier": identifier,
            "mediaClass": media_by_tier.get(tier, tier),
            "canonicalPath": canonical,
            "runtimeConsumer": "XR registry",
            "requiredFormat": Path(canonical).suffix.lstrip("."),
            "technicalContract": {
                "purpose": purpose,
                "claimGate": claim_gate or "production-final",
                "proofRequired": proof_required != "false",
            },
            "sourceAuthority": authority,
        })
    if len(rows) != 87:
        raise ValueError(f"XR registry must contain 87 slots; found {len(rows)}")
    return rows, authority


def placeholder_candidates() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    text, authority = fetch_text(
        SPATIAL_REPO,
        "urai-tier1/public/assets/urai-aaa-full-pack/manifest.json",
        SPATIAL_REF,
    )
    payload = json.loads(text)
    assets = payload.get("assets", [])
    if len(assets) != 180:
        raise ValueError(f"AAA placeholder estate must contain 180 records; found {len(assets)}")
    candidates = []
    for entry in assets:
        for media, key in (("image-placeholder", "visual"), ("motion-placeholder", "motion"), ("audio-placeholder", "ambient"), ("audio-placeholder", "chime")):
            path = entry.get(key)
            if path:
                candidates.append({
                    "version": entry.get("version"),
                    "identifier": entry.get("id"),
                    "role": entry.get("role"),
                    "mediaClass": media,
                    "candidatePath": str(path).lstrip("/"),
                    "declaredState": entry.get("status"),
                    "launchUse": entry.get("launchUse"),
                })
    unique = {candidate["candidatePath"]: candidate for candidate in candidates}
    return list(unique.values()), authority


def legacy_glb_candidates() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    text, authority = fetch_text(PROD_REPO, "manifest/glb_manifest.json", PROD_REF)
    payload = json.loads(text)
    rows = []
    for entry in payload.get("assets", []):
        path = f"public{entry['pathPublic']}"
        present, metadata = remote_file(PROD_REPO, path, PROD_REF)
        rows.append({
            "identifier": entry.get("name"),
            "family": entry.get("category"),
            "mediaClass": "model-3d-candidate",
            "candidatePath": path,
            "repository": PROD_REPO,
            "ref": PROD_REF,
            "present": present,
            **metadata,
        })
    return rows, authority


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    canonical = visual_entries()
    launch, launch_authority = launch_critical_entries()
    xr, xr_authority = xr_entries()

    by_path: dict[str, dict[str, Any]] = {}
    duplicate_declarations: dict[str, list[str]] = defaultdict(list)
    for row in canonical + launch + xr:
        path = str(row["canonicalPath"]).lstrip("/")
        declaration = f"{row['sourceAuthority']}#{row['identifier']}"
        if path in by_path:
            duplicate_declarations[path].append(declaration)
            existing = by_path[path]
            existing.setdefault("additionalDeclarations", []).append({
                "version": row["version"],
                "identifier": row["identifier"],
                "family": row["family"],
                "sourceAuthority": row["sourceAuthority"],
            })
            continue
        row["canonicalPath"] = path
        by_path[path] = row
        duplicate_declarations[path].append(declaration)

    rows = []
    for path, row in sorted(by_path.items()):
        present, metadata = remote_file(SPATIAL_REPO, public_repo_path(path), SPATIAL_REF)
        declared_state = row.get("declaredState")
        if present:
            status = "present-awaiting-certification"
        elif declared_state in {"future", "pending-final-review"}:
            status = "present-but-incomplete" if present else "missing-with-recoverable-candidate"
        else:
            status = "missing-with-no-candidate"
        row.update({
            "currentCandidatePaths": [public_repo_path(path)] if present else [],
            "acceptanceStatus": status,
            "provenanceStatus": "declared" if row.get("declaredSource") else "incomplete",
            "licenseStatus": "declared" if row.get("license") else "incomplete",
            "generationRequirement": "blocked-pending-candidate-reconciliation",
            "integrationStatus": "canonical-path-present" if present else "not-integrated",
            "proofStatus": "pending",
            "runtimePresent": present,
            **metadata,
        })
        rows.append(row)

    placeholders, placeholder_authority = placeholder_candidates()
    legacy_glbs, glb_authority = legacy_glb_candidates()
    counts_by_version = Counter(str(row["version"]) for row in rows)
    counts_by_media = Counter(str(row["mediaClass"]) for row in rows)
    counts_by_status = Counter(str(row["acceptanceStatus"]) for row in rows)
    candidate_counts = Counter(candidate["mediaClass"] for candidate in placeholders + legacy_glbs)

    ledger = {
        "schemaVersion": "1.0.0",
        "program": "URAI V1-V5 canonical multimodal estate",
        "providerCalls": 0,
        "spendUsd": "0.00",
        "generationAuthorized": False,
        "canonicalSlotCount": len(rows),
        "countsByVersion": dict(sorted(counts_by_version.items())),
        "countsByMediaClass": dict(sorted(counts_by_media.items())),
        "countsByAcceptanceStatus": dict(sorted(counts_by_status.items())),
        "candidateCountsByMediaClass": dict(sorted(candidate_counts.items())),
        "authorities": {
            "launchCritical": launch_authority,
            "xrRegistry": xr_authority,
            "placeholderEstate": placeholder_authority,
            "legacyGlbManifest": glb_authority,
        },
        "canonicalSlots": rows,
        "placeholderCandidates": placeholders,
        "legacyGlbCandidates": legacy_glbs,
        "duplicateDeclarations": {
            path: declarations for path, declarations in duplicate_declarations.items() if len(declarations) > 1
        },
    }
    ledger_path = OUT / "v1-v5-multimodal-ledger.json"
    ledger_path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    summary = {
        key: ledger[key] for key in (
            "schemaVersion", "program", "providerCalls", "spendUsd", "generationAuthorized",
            "canonicalSlotCount", "countsByVersion", "countsByMediaClass",
            "countsByAcceptanceStatus", "candidateCountsByMediaClass"
        )
    }
    summary["ledgerSha256"] = hashlib.sha256(ledger_path.read_bytes()).hexdigest()
    summary["missingCanonicalPaths"] = [
        row["canonicalPath"] for row in rows if not row["runtimePresent"]
    ]
    (OUT / "v1-v5-multimodal-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
