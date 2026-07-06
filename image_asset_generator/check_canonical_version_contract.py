from __future__ import annotations

import json
from pathlib import Path

import canonical_release_manifests

BASE = Path(__file__).resolve().parent
CATALOG = BASE / "canonical_version_catalog.json"
EXPECTED = {
    "v1": (53, "assets/urai"),
    "v2": (80, "assets/urai/v2"),
    "v3": (14, "assets/urai/v3"),
    "v4": (39, "assets/urai/xr"),
    "v5": (27, "assets/urai/v5"),
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    catalog = read_json(CATALOG)
    versions = catalog.get("versions", {})
    if set(versions) != set(EXPECTED):
        raise AssertionError(f"Version set drift: {sorted(versions)}")

    forge = (BASE / "forge_versioned.py").read_text(encoding="utf-8")
    if "canonical_version_catalog.json" not in forge:
        raise AssertionError("forge_versioned.py must use canonical_version_catalog.json")

    for version, (expected_count, expected_prefix) in EXPECTED.items():
        config = versions[version]
        if int(config.get("expectedOutputs", -1)) != expected_count:
            raise AssertionError(f"{version} expectedOutputs drift")
        if str(config.get("assetPrefix", "")).rstrip("/") != expected_prefix:
            raise AssertionError(f"{version} assetPrefix drift")

        manifest_path = canonical_release_manifests.build(version)
        entries = read_json(manifest_path)
        if len(entries) != expected_count:
            raise AssertionError(
                f"{version} count drift: expected {expected_count}, found {len(entries)}"
            )

        names = [entry.get("name") for entry in entries]
        paths = [entry.get("canonical_path") for entry in entries]
        if len(names) != len(set(names)):
            raise AssertionError(f"{version} duplicate names")
        if len(paths) != len(set(paths)):
            raise AssertionError(f"{version} duplicate paths")

        for name, path in zip(names, paths):
            if not isinstance(name, str) or not name:
                raise AssertionError(f"{version} invalid name")
            if not isinstance(path, str) or not path:
                raise AssertionError(f"{version}:{name} missing canonical_path")
            if version == "v1":
                valid = path.startswith("assets/urai/")
            else:
                valid = path.startswith(expected_prefix + "/")
            if not valid:
                raise AssertionError(f"{version}:{name} path escapes {expected_prefix}")

        configured = (BASE / config["manifest"]).resolve()
        if configured != manifest_path.resolve():
            raise AssertionError(f"{version} catalog manifest drift")
        print(f"PASS {version}: {expected_count} assets")

    print("Canonical version contract passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
