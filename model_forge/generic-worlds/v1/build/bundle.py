#!/usr/bin/env python3
"""Write an immutable deterministic candidate-data archive; never promote assets."""
import argparse
import hashlib
import json
import stat
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--version", default="1.0.2")
    parser.add_argument("--review", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Refusing to overwrite an immutable archive")
    members = {}

    def add(name, path):
        if name in members:
            raise ValueError(f"Duplicate archive name: {name}")
        if path.is_symlink():
            raise ValueError(f"Refusing symlink: {path}")
        members[name] = path

    for part in ("packages", "kits", "receipts"):
        for path in sorted((ROOT / part).rglob("*")):
            if path.is_file():
                add(path.relative_to(ROOT).as_posix(), path)
    for path in sorted((ROOT / "qa").rglob("*")):
        if path.is_file() and path.suffix in (".json", ".log", ".txt"):
            name = "receipts/static-qa/" + path.relative_to(ROOT / "qa").as_posix()
            if path.suffix == ".log":
                name = name[:-4] + ".txt"
            add(name, path)
    for name in ("hybrid-insert-contract.json", "ASSET-READ-ME.txt"):
        add(name, ROOT / name)
    license_path = ROOT.parents[2] / "LICENSE"
    if license_path.is_file():
        add("LICENSE", license_path)
    if args.review:
        for path in sorted(args.review.glob("*.png")):
            add("review/" + path.name, path)
    inventory = []
    for name, path in sorted(members.items()):
        inventory.append({"path": name, "bytes": path.stat().st_size,
                          "sha256": digest(path.read_bytes())})
    manifest = {
        "schemaVersion": 1, "truthClassification": "GENERIC",
        "currentVersion": args.version, "status": "NEEDS_REWORK",
        "assetComplete": False, "runtimeIntegrated": False,
        "productionDeployed": False, "independentlyApproved": False,
        "xrCertified": False, "visualAccepted": False,
        "history": {"1.0.0": "REJECTED", "1.0.1": "INCOMPLETE_DEVELOPMENT",
                    args.version: "MACHINE_VALIDATED_VISUAL_REWORK_REQUIRED"},
        "files": inventory,
        "storageRole": "Quarantined candidate bytes; existing Model Forge alone owns promotion/resolution",
        "sourceCodeIncluded": False,
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "x", compression=zipfile.ZIP_DEFLATED,
                         compresslevel=9, allowZip64=True) as archive:
        for name in sorted([*members, "artifact-manifest.json"]):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.internal_attr = 0
            info.compress_type = zipfile.ZIP_DEFLATED
            data = manifest_bytes if name == "artifact-manifest.json" else members[name].read_bytes()
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    result = {"archive": str(args.output.resolve()), "bytes": args.output.stat().st_size,
              "sha256": digest(args.output.read_bytes()), "inventoryFiles": len(inventory),
              "manifestSha256": digest(manifest_bytes), "sourceCodeIncluded": False}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
