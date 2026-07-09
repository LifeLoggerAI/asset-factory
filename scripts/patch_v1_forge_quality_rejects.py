#!/usr/bin/env python3
"""Patch the V1 asset manifest entries that failed the AAA quality gate.

Run from the repository root:
    python scripts/patch_v1_forge_quality_rejects.py
"""

from __future__ import annotations

import json
from pathlib import Path

MANIFEST = Path("image_asset_generator/manifest.json")

UPDATES = {
    "ground_reception": {
        "prompt": "Premium physical reception desk inside a private futuristic life operations room, sculptural wood and glass reception architecture, soft cyan task light, layered believable objects, visible room context, cinematic depth, premium materials, photographed in its environment, no labels, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
    "ground_privacy_sanctuary": {
        "prompt": "Physical consent vault and privacy sanctuary built into a premium spatial operations room, protected warm light, secure tactile controls, layered architectural depth, premium believable materials, visible environmental context, cinematic realism, no labels, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
    "ground_logistics": {
        "prompt": "Physical logistics bay in a private life operations floor, organized delivery cubbies, errands objects, approval staging area, layered room context, elegant cinematic architecture, premium materials, believable photographed environment, no labels, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
    "ground_wellness": {
        "prompt": "Quiet physical wellness nook in a private operations room, seating, ambient body rhythm light, restorative materials, intimate cinematic realism, layered room depth, premium spatial environment, believable photographed context, no labels, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
    "ground_memory_archive": {
        "prompt": "Physical memory archive case in a private future operations room, protected drawers, luminous personal artifacts, premium museum-like object, layered room context, believable photographed environment, cinematic depth, no labels, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
    "avatar_receptionist": {
        "prompt": "Full-body premium light-form private workforce receptionist, warm human presence, elegant service posture, clearly readable silhouette, subtle face and hand definition, layered cinematic materials, believable premium body design, standing for a spatial room, transparent background, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
    "avatar_privacy_steward": {
        "prompt": "Full-body premium light-form privacy steward, protective calm posture, clearly readable silhouette, subtle face and hand definition, layered cinematic materials, secure trustworthy presence, premium body design suitable for a spatial room, transparent background, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
    "avatar_logistics_helper": {
        "prompt": "Full-body premium light-form logistics helper, practical attentive posture, clearly readable silhouette, subtle face and hand definition, layered cinematic materials, capable supportive presence, premium body design suitable for a spatial room, transparent background, no text",
        "sizes": [1536],
        "prompt_version": "v3",
    },
}


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    seen = set()
    for entry in manifest:
        name = entry.get("name")
        if name in UPDATES:
            entry.update(UPDATES[name])
            seen.add(name)

    missing = sorted(set(UPDATES) - seen)
    if missing:
        raise SystemExit(f"Manifest entries not found: {', '.join(missing)}")

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print("Patched V1 forge quality rejects:")
    for name in sorted(seen):
        print(f"- {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
