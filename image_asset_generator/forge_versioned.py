from pathlib import Path

import canonical_release_manifests
import forge_versioned_legacy as legacy

ROOT = Path(__file__).resolve().parent
legacy.CATALOG_PATH = ROOT / "canonical_version_catalog.json"


def build_manifest(version):
    return canonical_release_manifests.build(version)


def map_paths(version, entries):
    config, _ = legacy.resolve_version(version)
    prefix = str(config["assetPrefix"]).rstrip("/") + "/"
    if prefix == "assets/urai/":
        return None
    result = {}
    for entry in entries:
        name = entry["name"]
        path = entry["canonical_path"]
        if not path.startswith(prefix):
            raise ValueError(f"{name} must stay under {prefix}")
        result[name] = path
    return result


legacy.build_selected_manifest = build_manifest
legacy.canonical_paths = map_paths


if __name__ == "__main__":
    raise SystemExit(legacy.main())
