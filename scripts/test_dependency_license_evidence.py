#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from apply_dependency_license_evidence import apply_evidence


TRANSITIVE_SBOM_BLOCKER = "resolved transitive SBOM has not been generated or verified"


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def fixture(root: Path, evidence_version: str = "11.3.0") -> tuple[Path, Path]:
    verification = root / "verification"
    evidence = root / "multimodal" / "dependency-license-evidence.json"
    write(verification / "license-inventory.json", {
        "components": [{
            "ecosystem": "pypi",
            "name": "Pillow",
            "declaredSpec": "Pillow==11.3.0",
            "scope": "required",
            "manifest": "image_asset_generator/requirements.txt",
            "license": None,
            "licenseKnown": False,
        }],
        "unknownRequiredLicenses": ["pypi:Pillow@Pillow==11.3.0 (image_asset_generator/requirements.txt)"],
        "coverageComplete": False,
    })
    write(verification / "supply-chain-evidence.json", {
        "schemaVersion": "1.1.0",
        "inventoryClass": "direct-source-manifest-inventory",
        "resolvedTransitiveSbomComplete": False,
        "sbomComplete": False,
        "blockers": [
            TRANSITIVE_SBOM_BLOCKER,
            "unknown required license: pypi:Pillow@Pillow==11.3.0 (image_asset_generator/requirements.txt)",
        ],
        "unknownRequiredLicenses": ["pypi:Pillow@Pillow==11.3.0 (image_asset_generator/requirements.txt)"],
        "licenseCoverageComplete": False,
        "releaseEligible": False,
    })
    write(verification / "source-sbom.cdx.json", {
        "metadata": {
            "properties": [
                {"name": "urai:inventoryClass", "value": "direct-source-manifest-inventory"},
                {"name": "urai:resolvedTransitiveGraph", "value": "false"},
            ]
        },
        "components": [{
            "type": "library",
            "name": "Pillow",
            "version": "Pillow==11.3.0",
            "purl": "pkg:pypi/Pillow",
            "properties": [
                {"name": "urai:manifest", "value": "image_asset_generator/requirements.txt"},
                {"name": "urai:declaredSpec", "value": "Pillow==11.3.0"},
            ],
        }]
    })
    write(evidence, {
        "schemaVersion": "1.0.0",
        "records": [{
            "ecosystem": "pypi",
            "name": "Pillow",
            "version": evidence_version,
            "declaredSpec": f"Pillow=={evidence_version}",
            "manifest": "image_asset_generator/requirements.txt",
            "license": "MIT-CMU",
            "status": "source-verified",
            "legalApproval": False,
            "source": {
                "repository": "python-pillow/Pillow",
                "tag": evidence_version,
                "path": "LICENSE",
                "blobSha": "10dd42d9eda66de3b8850e988e3915e3e8a9dd2c",
            },
        }],
    })
    return verification, evidence


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        verification, evidence = fixture(root)
        result = apply_evidence(verification, evidence)
        assert result["licenseCoverageComplete"] is True
        assert result["resolvedTransitiveSbomComplete"] is False
        assert result["sbomComplete"] is False
        assert result["releaseEligible"] is False
        assert result["blockers"] == [TRANSITIVE_SBOM_BLOCKER]
        inventory = json.loads((verification / "license-inventory.json").read_text())
        assert inventory["components"][0]["license"] == "MIT-CMU"
        assert inventory["components"][0]["licenseEvidence"]["legalApproval"] is False
        sbom = json.loads((verification / "source-sbom.cdx.json").read_text())
        assert sbom["components"][0]["licenses"][0]["license"]["name"] == "MIT-CMU"

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        verification, evidence = fixture(root, evidence_version="11.2.0")
        result = apply_evidence(verification, evidence)
        assert result["licenseCoverageComplete"] is False
        assert result["releaseEligible"] is False
        assert result["unmatchedLicenseEvidence"]
        assert TRANSITIVE_SBOM_BLOCKER in result["blockers"]
        assert any(item.startswith("unknown required license:") for item in result["blockers"])
        assert any(item.startswith("unmatched license evidence:") for item in result["blockers"])

    print("PASS exact-version license evidence cannot clear unresolved transitive SBOM gate")


if __name__ == "__main__":
    main()
