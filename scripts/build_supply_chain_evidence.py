#!/usr/bin/env python3
"""Build honest source-tree, dependency, lockfile, and license evidence.

This intentionally distinguishes direct source-manifest inventory from a complete
resolved SBOM. Missing locks, unpinned Python requirements, and unknown licenses
remain release blockers instead of being silently treated as successful evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import uuid
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification"
LOCK_NAMES = ("package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock")
IGNORED_PARTS = {"_audit", "node_modules", ".next", "dist", "build", "out", "coverage"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_text(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def tracked_files() -> list[Path]:
    raw = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    paths = []
    for item in raw.decode("utf-8").split("\0"):
        if not item:
            continue
        pure = PurePosixPath(item)
        if any(part in IGNORED_PARTS for part in pure.parts):
            continue
        path = ROOT / pure
        if path.is_file():
            paths.append(path)
    return sorted(paths, key=lambda path: path.relative_to(ROOT).as_posix())


def source_tree_evidence(files: list[Path], head_sha: str) -> dict[str, Any]:
    entries = [
        {
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in files
    ]
    canonical = "".join(f"{item['sha256']}  {item['path']}\n" for item in entries)
    tree_digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "schemaVersion": "1.0.0",
        "repository": "LifeLoggerAI/asset-factory",
        "headSha": head_sha,
        "trackedFileCount": len(entries),
        "treeSha256": tree_digest,
        "files": entries,
    }


def nearest_lock(package_path: Path, tracked_set: set[str]) -> str | None:
    directory = package_path.parent
    while True:
        for name in LOCK_NAMES:
            candidate = (directory / name).relative_to(ROOT).as_posix()
            if candidate in tracked_set:
                return candidate
        if directory == ROOT:
            return None
        directory = directory.parent


def npm_lock_licenses(lock_path: Path) -> dict[str, str | None]:
    if lock_path.name not in {"package-lock.json", "npm-shrinkwrap.json"}:
        return {}
    try:
        payload = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    result: dict[str, str | None] = {}
    packages = payload.get("packages")
    if isinstance(packages, dict):
        for key, value in packages.items():
            if not isinstance(value, dict) or "node_modules/" not in key:
                continue
            name = key.split("node_modules/", 1)[1]
            result[name] = value.get("license") if isinstance(value.get("license"), str) else None
    return result


def python_requirement(line: str) -> tuple[str, str, bool] | None:
    value = line.strip()
    if not value or value.startswith("#") or value.startswith(("-r", "--requirement")):
        return None
    markerless = value.split(";", 1)[0].strip()
    if markerless.startswith(("git+", "http://", "https://")):
        pinned = "@" in markerless and any(token in markerless for token in ("#sha256=", "@"))
        return markerless, markerless, pinned
    name = markerless
    for token in ("===", "==", ">=", "<=", "~=", "!=", ">", "<"):
        if token in markerless:
            name = markerless.split(token, 1)[0].strip()
            break
    pinned = "==" in markerless or "===" in markerless
    return name, markerless, pinned


def collect_dependencies(files: list[Path]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str], list[str]]:
    tracked_set = {path.relative_to(ROOT).as_posix() for path in files}
    components: list[dict[str, Any]] = []
    license_rows: list[dict[str, Any]] = []
    missing_locks: list[str] = []
    unpinned_python: list[str] = []

    for package_path in sorted(path for path in files if path.name == "package.json"):
        relative = package_path.relative_to(ROOT).as_posix()
        try:
            payload = json.loads(package_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            missing_locks.append(f"{relative}: invalid package.json")
            continue
        lock = nearest_lock(package_path, tracked_set)
        if lock is None:
            missing_locks.append(relative)
            lock_licenses: dict[str, str | None] = {}
        else:
            lock_licenses = npm_lock_licenses(ROOT / lock)
        for scope, field in (("required", "dependencies"), ("optional", "optionalDependencies"), ("development", "devDependencies")):
            dependencies = payload.get(field, {})
            if not isinstance(dependencies, dict):
                continue
            for name, spec in sorted(dependencies.items()):
                component = {
                    "type": "library",
                    "name": name,
                    "version": str(spec),
                    "purl": f"pkg:npm/{name}",
                    "scope": "optional" if scope == "optional" else ("excluded" if scope == "development" else "required"),
                    "properties": [
                        {"name": "urai:manifest", "value": relative},
                        {"name": "urai:declaredSpec", "value": str(spec)},
                        {"name": "urai:lockfile", "value": lock or "MISSING"},
                    ],
                }
                components.append(component)
                license_value = lock_licenses.get(name)
                license_rows.append(
                    {
                        "ecosystem": "npm",
                        "name": name,
                        "declaredSpec": str(spec),
                        "scope": scope,
                        "manifest": relative,
                        "lockfile": lock,
                        "license": license_value,
                        "licenseKnown": bool(license_value),
                    }
                )

    requirements = sorted(
        path for path in files if path.name.startswith("requirements") and path.suffix == ".txt"
    )
    for requirement_path in requirements:
        relative = requirement_path.relative_to(ROOT).as_posix()
        for line_number, line in enumerate(requirement_path.read_text(encoding="utf-8").splitlines(), start=1):
            parsed = python_requirement(line)
            if parsed is None:
                continue
            name, spec, pinned = parsed
            if not pinned:
                unpinned_python.append(f"{relative}:{line_number}:{spec}")
            components.append(
                {
                    "type": "library",
                    "name": name,
                    "version": spec,
                    "purl": f"pkg:pypi/{name}",
                    "scope": "required",
                    "properties": [
                        {"name": "urai:manifest", "value": relative},
                        {"name": "urai:declaredSpec", "value": spec},
                        {"name": "urai:exactlyPinned", "value": str(pinned).lower()},
                    ],
                }
            )
            license_rows.append(
                {
                    "ecosystem": "pypi",
                    "name": name,
                    "declaredSpec": spec,
                    "scope": "required",
                    "manifest": relative,
                    "lockfile": relative if pinned else None,
                    "license": None,
                    "licenseKnown": False,
                }
            )

    unique: dict[tuple[str, str, str], dict[str, Any]] = {}
    for component in components:
        key = (component["purl"], component["version"], component["properties"][0]["value"])
        unique[key] = component
    return list(unique.values()), license_rows, sorted(set(missing_locks)), sorted(set(unpinned_python))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    head_sha = git_text("rev-parse", "HEAD")
    files = tracked_files()
    source = source_tree_evidence(files, head_sha)
    components, licenses, missing_locks, unpinned_python = collect_dependencies(files)
    unknown_required_licenses = sorted(
        f"{row['ecosystem']}:{row['name']}@{row['declaredSpec']} ({row['manifest']})"
        for row in licenses
        if row["scope"] != "development" and not row["licenseKnown"]
    )

    source_path = OUT / "source-tree.json"
    source_path.write_text(json.dumps(source, indent=2) + "\n", encoding="utf-8")
    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, source['treeSha256'])}",
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": "LifeLoggerAI/asset-factory",
                "version": head_sha,
            },
            "properties": [
                {"name": "urai:sourceTreeSha256", "value": source["treeSha256"]},
                {"name": "urai:completeness", "value": "direct-source-manifests-and-available-npm-lock-metadata"},
                {"name": "urai:releaseClaim", "value": "not a complete resolved SBOM while blockers remain"},
            ],
        },
        "components": sorted(components, key=lambda item: (item["purl"], item["version"])),
    }
    (OUT / "source-sbom.cdx.json").write_text(json.dumps(sbom, indent=2) + "\n", encoding="utf-8")
    license_inventory = {
        "schemaVersion": "1.0.0",
        "headSha": head_sha,
        "sourceTreeSha256": source["treeSha256"],
        "components": licenses,
        "unknownRequiredLicenses": unknown_required_licenses,
        "coverageComplete": not unknown_required_licenses,
        "claimBoundary": "License inventory is complete only when every non-development dependency has a resolved license.",
    }
    (OUT / "license-inventory.json").write_text(json.dumps(license_inventory, indent=2) + "\n", encoding="utf-8")

    blockers = []
    blockers.extend(f"missing lockfile: {path}" for path in missing_locks)
    blockers.extend(f"unpinned Python requirement: {item}" for item in unpinned_python)
    blockers.extend(f"unknown required license: {item}" for item in unknown_required_licenses)
    evidence = {
        "schemaVersion": "1.0.0",
        "repository": "LifeLoggerAI/asset-factory",
        "headSha": head_sha,
        "sourceTreeSha256": source["treeSha256"],
        "trackedFileCount": source["trackedFileCount"],
        "directComponentCount": len(components),
        "missingLockfiles": missing_locks,
        "unpinnedPythonRequirements": unpinned_python,
        "unknownRequiredLicenses": unknown_required_licenses,
        "sbomComplete": not missing_locks and not unpinned_python,
        "licenseCoverageComplete": not unknown_required_licenses,
        "releaseEligible": not blockers,
        "blockers": blockers,
        "claimBoundary": "Source and direct dependency evidence generated; release remains blocked until lock and license coverage is complete.",
    }
    (OUT / "supply-chain-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, indent=2))
    if args.require_complete and blockers:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
