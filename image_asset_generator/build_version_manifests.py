"""Build canonical URAI release-version manifests from the production asset contract.

Release version meaning is fixed here:
- V1: public route world final
- V2: living system states
- V3: spatial/XR graphics (hardware proof remains a separate gate)
- V4: autonomous council and operations
- V5: relationships, legacy, governance, and whole-life convergence

The checked-in legacy manifests are retained as source material for V4/V5 migration.
Generated manifests live under ``manifests/generated`` so the production forge can
stage them without mutating the source contract files.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

BASE_DIR = Path(__file__).resolve().parent
MANIFESTS_DIR = BASE_DIR / "manifests"
GENERATED_DIR = MANIFESTS_DIR / "generated"
V1_SOURCE = BASE_DIR / "manifest.json"
LEGACY_V2_SOURCE = MANIFESTS_DIR / "v2.manifest.json"
LEGACY_V3_SOURCE = MANIFESTS_DIR / "v3.manifest.json"
LEGACY_V5_SOURCE = MANIFESTS_DIR / "v5.manifest.json"


def _slug_title(value: str) -> str:
    return value.replace("-", " ").replace("_", " ").strip()


def _entry(
    *,
    name: str,
    category: str,
    path: str,
    purpose: str,
    size: int,
    aspect_ratio: str,
    alpha: bool,
    version: str,
    prompt_version: str = "v1",
    claim_gate: str | None = None,
) -> dict[str, Any]:
    subject = _slug_title(name)
    if alpha:
        prompt = (
            f"Premium URAI {purpose.lower()}, isolated as one believable production object or embodied state. "
            "Cinematic materials, clean silhouette, readable at small size, transparent background, "
            "no words, no letters, no logo, no card frame, no flat vector placeholder."
        )
    else:
        prompt = (
            f"Premium cinematic URAI {purpose.lower()} as a believable spatial scene. "
            "Strong foreground, middle distance and background depth, physically coherent lighting, "
            "route-specific emotional storytelling, mobile-safe composition where applicable, "
            "no words, no letters, no logo, no dashboard grid, no poster or television frame."
        )

    result: dict[str, Any] = {
        "name": name,
        "category": category,
        "prompt": prompt,
        "sizes": [size],
        "aspect_ratio": aspect_ratio,
        "alpha": alpha,
        "status": "prompted",
        "path_template": f"assets/urai/{version}/{path}_{{size}}.png",
        "canonical_path": f"assets/urai/{version}/{path}.webp",
        "prompt_version": prompt_version,
        "quality": "high",
        "tags": [version, category, subject],
    }
    if claim_gate:
        result["claim_gate"] = claim_gate
    return result


def _v1_manifest() -> list[dict[str, Any]]:
    entries = json.loads(V1_SOURCE.read_text(encoding="utf-8"))
    additions = [
        ("avatar_relationship_liaison", "relationship-liaison", "Relationship Liaison embodied helper"),
        ("avatar_operator", "operator", "Operations coordinator embodied helper"),
        ("avatar_builder", "builder", "Builder embodied helper"),
        ("avatar_protector", "protector", "Protector embodied helper"),
        ("avatar_mirror", "mirror", "Mirror reflection guide embodied helper"),
        ("avatar_guide", "guide", "General URAI guide embodied helper"),
    ]
    existing = {entry["name"] for entry in entries}
    for name, filename, purpose in additions:
        if name in existing:
            continue
        entries.append(
            {
                "name": name,
                "category": "avatar",
                "prompt": (
                    f"Full-body premium light-form {purpose.lower()}, warm humane presence, subtle cinematic materials, "
                    "suitable for standing and walking in a private spatial room, transparent background, "
                    "no words, no letters, no logo."
                ),
                "sizes": [1024],
                "aspect_ratio": "2:3",
                "alpha": True,
                "status": "prompted",
                "path_template": f"assets/urai/avatars/{filename}_{{size}}.png",
                "prompt_version": "v3",
                "quality": "high",
            }
        )
    return entries


V2_GROUPS: list[tuple[str, str, list[tuple[str, str]]]] = [
    (
        "helper-state",
        "helpers",
        [
            ("welcome-guide-idle", "Welcome Guide idle presence"),
            ("welcome-guide-working", "Welcome Guide actively helping"),
            ("privacy-steward-protecting", "Privacy Steward protection state"),
            ("schedule-steward-approval", "Schedule Steward waiting for approval"),
            ("wellness-guide-complete", "Wellness Guide completion state"),
            ("relationship-liaison-blocked", "Relationship Liaison blocked or waiting state"),
            ("logistics-helper-working", "Logistics Helper working state"),
            ("archivist-protected", "Archivist protected-memory state"),
            ("operator-warning", "Operator gentle warning state"),
            ("trust-steward-mobile", "Trust Steward mobile portrait"),
            ("mirror-guide-mobile", "Mirror Guide mobile portrait"),
        ],
    ),
    (
        "ground-object",
        "objects",
        [
            ("keys-idle", "Keys object idle state"),
            ("keys-inspect", "Keys object inspect state"),
            ("kitchen-table-active", "Kitchen table active family and life context"),
            ("work-console-approval", "Work console approval state"),
            ("memory-case-protected", "Memory case protected state"),
            ("calendar-tower-complete", "Calendar tower completion state"),
            ("body-signal-warning", "Body signal soft warning state"),
            ("privacy-lock-active", "Privacy lock active state"),
            ("consent-key-requested", "Consent key requested state"),
        ],
    ),
    (
        "memory-star",
        "stars",
        [
            ("star-base", "Base image-bearing memory star"),
            ("star-hover", "Hover memory star"),
            ("star-selected", "Selected memory star"),
            ("star-focus-ready", "Focus-ready memory star"),
            ("star-replay-ready", "Replay-ready memory star"),
            ("star-protected", "Protected memory star"),
            ("star-shared-consent", "Shared-with-consent memory star"),
            ("star-archived", "Archived memory star"),
            ("star-new", "New memory star"),
            ("recovery-star", "Recovery memory category star"),
            ("relationship-star", "Relationship memory category star"),
            ("family-star", "Family memory category star"),
            ("legacy-star", "Legacy memory category star"),
            ("place-star", "Place memory category star"),
            ("body-star", "Body memory category star"),
            ("work-star", "Work memory category star"),
            ("creation-star", "Creation memory category star"),
            ("grief-star", "Grief memory category star"),
            ("milestone-star", "Milestone memory category star"),
        ],
    ),
    (
        "focus-variant",
        "focus",
        [
            ("recovery-focus-chamber", "Recovery Focus chamber"),
            ("relationship-focus-chamber", "Relationship Focus chamber"),
            ("family-focus-chamber", "Family Focus chamber"),
            ("legacy-focus-chamber", "Legacy Focus chamber"),
            ("place-focus-chamber", "Place Focus chamber"),
            ("body-focus-chamber", "Body Focus chamber"),
            ("work-focus-chamber", "Work Focus chamber"),
            ("grief-focus-chamber", "Grief Focus chamber"),
            ("missing-image-focus-fallback", "Beautiful missing-image Focus fallback"),
        ],
    ),
    (
        "replay-template",
        "replay",
        [
            ("recovery-replay-template", "Recovery Replay cinematic environment"),
            ("relationship-replay-template", "Relationship Replay cinematic environment"),
            ("legacy-replay-template", "Legacy Replay cinematic environment"),
            ("place-replay-template", "Place Replay cinematic environment"),
            ("body-replay-template", "Body Replay cinematic environment"),
            ("work-replay-template", "Work Replay cinematic environment"),
            ("milestone-replay-template", "Milestone Replay cinematic environment"),
            ("grief-replay-template", "Grief Replay cinematic environment"),
            ("daily-reset-replay-template", "Daily reset Replay cinematic environment"),
        ],
    ),
    (
        "mirror-pattern",
        "mirror",
        [
            ("body-pattern-glyph", "Body pattern glyph"),
            ("relationship-pattern-glyph", "Relationship pattern glyph"),
            ("place-pattern-glyph", "Place pattern glyph"),
            ("work-pattern-glyph", "Work pattern glyph"),
            ("pressure-pattern-glyph", "Pressure pattern glyph"),
            ("growth-pattern-state", "Growth pattern state"),
            ("soft-warning-pattern-state", "Soft warning pattern state"),
        ],
    ),
    (
        "passport-state",
        "passport",
        [
            ("passport-private", "Passport private state"),
            ("passport-consent-requested", "Passport consent-requested state"),
            ("passport-consent-granted", "Passport consent-granted state"),
            ("passport-consent-revoked", "Passport consent-revoked state"),
            ("passport-export-ready", "Passport export-ready state"),
            ("passport-delete-ready", "Passport delete-ready state"),
            ("passport-provenance-visible", "Passport provenance-visible state"),
            ("passport-shared-expired", "Passport expired shared-access state"),
        ],
    ),
    (
        "onboarding",
        "onboarding",
        [
            ("first-run-home-card", "Home first-run teaching scene"),
            ("first-run-ground-card", "Ground first-run teaching scene"),
            ("first-run-life-map-card", "Life Map first-run teaching scene"),
            ("first-run-privacy-card", "Privacy first-run teaching scene"),
        ],
    ),
    (
        "accessibility",
        "accessibility",
        [
            ("reduced-motion-equivalent", "Reduced-motion visual equivalent"),
            ("high-contrast-equivalent", "High-contrast visual equivalent"),
            ("caption-card", "Caption-safe cinematic visual system"),
            ("haptic-waveform-visual", "Haptic waveform visual alternative"),
        ],
    ),
]


def _v2_manifest() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for category, folder, items in V2_GROUPS:
        for slug, purpose in items:
            alpha = category in {"helper-state", "ground-object", "memory-star", "mirror-pattern"}
            if category == "helper-state":
                size, ratio = 1024, "2:3"
            elif alpha:
                size, ratio = 768, "1:1"
            elif category in {"focus-variant", "replay-template"}:
                size, ratio = 1400, "16:9"
            else:
                size, ratio = 1200, "4:3"
            entries.append(
                _entry(
                    name=f"v2_{slug.replace('-', '_')}",
                    category=f"v2_{category.replace('-', '_')}",
                    path=f"{folder}/{slug}",
                    purpose=purpose,
                    size=size,
                    aspect_ratio=ratio,
                    alpha=alpha,
                    version="v2",
                    prompt_version="v3",
                )
            )
    return entries


V3_GRAPHICS: list[tuple[str, str, str, str]] = [
    ("xr-entry", "quest-entry-main", "Quest Browser XR entry chamber preview", "physical-proof"),
    ("xr-entry", "webxr-fallback", "WebXR unsupported fallback", "preview"),
    ("xr-entry", "desktop-preview", "Desktop XR preview state", "preview"),
    ("xr-entry", "mobile-ar-state", "Mobile AR availability state", "preview"),
    ("xr-entry", "proof-pending-state", "Honest pending-hardware-proof state", "preview"),
    ("xr-entry", "proof-complete-state", "Hardware proof complete UI state, never used as proof itself", "physical-proof"),
    ("input", "gaze-cursor", "Gaze selection cursor", "physical-proof"),
    ("input", "controller-reticle", "Controller reticle", "physical-proof"),
    ("input", "hand-ray", "Hand tracking ray", "physical-proof"),
    ("input", "hover-pulse", "XR hover pulse", "production-final"),
    ("input", "select-pulse", "XR select pulse", "production-final"),
    ("input", "back-unwind-gesture", "Back and unwind gesture visual", "production-final"),
    ("input", "long-press-indicator", "Long-press confirmation indicator", "production-final"),
    ("input", "consent-confirmation-ui", "Consent confirmation spatial UI", "production-final"),
    ("input", "high-contrast-focus-ring", "High-contrast XR focus ring", "production-final"),
    ("comfort", "comfort-mode", "Comfort mode visual state", "production-final"),
    ("comfort", "seated-mode-card", "Seated mode visual state", "production-final"),
    ("comfort", "teleport-marker", "Teleport destination marker", "production-final"),
    ("comfort", "snap-turn-indicator", "Snap-turn indicator", "production-final"),
    ("comfort", "recenter-marker", "Recenter marker", "production-final"),
    ("comfort", "height-calibration-guide", "Height calibration guide", "production-final"),
    ("comfort", "low-stimulation-mode", "Low-stimulation mode visual", "production-final"),
    ("comfort", "comfort-vignette", "Movement comfort vignette", "production-final"),
    ("ar", "tabletop-life-map", "AR tabletop Life Map", "production-final"),
    ("ar", "place-node-anchors", "AR place-node anchors", "production-final"),
    ("ar", "star-selection", "AR memory-star selection state", "production-final"),
    ("ar", "focus-preview", "AR Focus preview", "production-final"),
    ("ar", "replay-mini-film", "AR Replay mini-film preview", "production-final"),
    ("ar", "privacy-boundary", "AR privacy boundary", "production-final"),
    ("ar", "scale-controls", "AR scale controls", "production-final"),
    ("ar", "unsupported-fallback", "Unsupported AR fallback", "preview"),
    ("mobile", "ios-app-icon", "iOS app icon", "preview"),
    ("mobile", "android-adaptive-icon", "Android adaptive icon", "preview"),
    ("mobile", "pwa-icon-set", "PWA install icon set", "preview"),
    ("mobile", "ios-splash-screen", "iOS cinematic splash screen", "preview"),
    ("mobile", "android-splash-screen", "Android cinematic splash screen", "preview"),
    ("mobile", "mobile-orb-sheet", "Native-feeling mobile orb state sheet", "production-final"),
    ("mobile", "spatial-gesture-overlay", "Mobile spatial gesture overlay", "production-final"),
    ("mobile", "replay-controls", "Mobile Replay control visual", "production-final"),
]


def _v3_manifest() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for folder, slug, purpose, claim_gate in V3_GRAPHICS:
        alpha = folder in {"input"} and slug not in {"consent-confirmation-ui"}
        ratio = "1:1" if alpha or "icon" in slug or "marker" in slug or "pulse" in slug else "16:9"
        size = 768 if ratio == "1:1" else 1400
        if "splash" in slug:
            ratio, size = "2:3", 1536
        entries.append(
            _entry(
                name=f"v3_{folder}_{slug.replace('-', '_')}",
                category=f"v3_{folder.replace('-', '_')}",
                path=f"{folder}/{slug}",
                purpose=purpose,
                size=size,
                aspect_ratio=ratio,
                alpha=alpha,
                version="xr",
                prompt_version="v3",
                claim_gate=claim_gate,
            )
        )
    return entries


def _remap_legacy(entries: Iterable[dict[str, Any]], old_version: str, new_version: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for source in entries:
        entry = dict(source)
        entry["name"] = str(entry["name"]).replace(f"{old_version}_", f"{new_version}_", 1)
        entry["category"] = str(entry.get("category", "")).replace(f"{old_version}_", f"{new_version}_", 1)
        entry["path_template"] = str(entry["path_template"]).replace(
            f"assets/urai/{old_version}/", f"assets/urai/{new_version}/", 1
        )
        canonical = entry.get("canonical_path")
        if canonical:
            entry["canonical_path"] = str(canonical).replace(
                f"assets/urai/{old_version}/", f"assets/urai/{new_version}/", 1
            )
        entry["prompt_version"] = "v3"
        entry["status"] = "prompted"
        result.append(entry)
    return result


def _write(name: str, entries: list[dict[str, Any]]) -> Path:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    output = GENERATED_DIR / f"{name}.manifest.json"
    output.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    return output


def build_all() -> dict[str, dict[str, Any]]:
    legacy_v2 = json.loads(LEGACY_V2_SOURCE.read_text(encoding="utf-8"))
    legacy_v3 = json.loads(LEGACY_V3_SOURCE.read_text(encoding="utf-8"))
    legacy_v5 = json.loads(LEGACY_V5_SOURCE.read_text(encoding="utf-8"))

    manifests = {
        "v1": _v1_manifest(),
        "v2": _v2_manifest(),
        "v3": _v3_manifest(),
        "v4": _remap_legacy(legacy_v2, "v2", "v4"),
        "v5": _remap_legacy(legacy_v3, "v3", "v5") + legacy_v5,
    }

    summary: dict[str, dict[str, Any]] = {}
    for version, entries in manifests.items():
        names = [entry["name"] for entry in entries]
        paths = [entry["path_template"] for entry in entries]
        if len(names) != len(set(names)):
            raise ValueError(f"{version} generated duplicate asset names")
        if len(paths) != len(set(paths)):
            raise ValueError(f"{version} generated duplicate output paths")
        output = _write(version, entries)
        summary[version] = {"count": len(entries), "manifest": str(output.relative_to(BASE_DIR))}

    summary_path = GENERATED_DIR / "manifest-build-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    build_all()
