from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
SPECS = ROOT / "media-specifications.json"
PHASES = ("home", "ascent", "lifemap", "focus", "replay")
ROUTES = {"home": "/home", "ascent": "/", "lifemap": "/life-map", "focus": "/focus", "replay": "/replay"}


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    audio_specs = json.loads(SPECS.read_text(encoding="utf-8"))["audio"]
    repaired = 0
    for asset in manifest["assets"]:
        if asset["lane"] != "audio":
            continue
        asset_type = str(asset["assetType"])
        phase = next((value for value in PHASES if asset_type.startswith(value + "-")), None)
        if phase is None:
            raise SystemExit(f"audio phase missing from assetType: {asset_type}")
        kind = asset_type[len(phase) + 1:]
        spec = audio_specs.get(kind)
        if spec is None:
            raise SystemExit(f"audio media specification missing for {kind}")
        route = ROUTES[phase]
        asset["world"] = phase
        asset["state"] = kind
        asset["routes"] = [route]
        asset["runtimeRoute"] = route
        asset["expectedOutputPath"] = f"multimodal/outputs/audio/{phase}/{phase}-{kind}.{spec['extension']}"
        asset["technicalBudget"] = {key: value for key, value in spec.items() if key not in {"extension", "consentRequired"}}
        if spec.get("consentRequired"):
            asset["consentRequirements"] = ["documented approved voice consent"]
            asset["likenessRequirements"] = ["documented approved voice consent"]
        repaired += 1
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if repaired != 30:
        raise SystemExit(f"expected 30 audio records, repaired {repaired}")
    print(json.dumps({"audioRecordsRepaired": repaired}, indent=2))


if __name__ == "__main__":
    main()
