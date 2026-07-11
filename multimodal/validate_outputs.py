from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
REPORT = ROOT / "output-validation-report.json"
REQUIRES_FILE = {"generated", "validated", "certified"}
MEDIA_EXTENSIONS = {".wav", ".ogg", ".aac", ".mp3", ".m4a", ".mp4", ".webm", ".mov"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffprobe(path: Path) -> dict:
    executable = shutil.which("ffprobe")
    if not executable:
        raise RuntimeError("ffprobe unavailable for media validation")
    completed = subprocess.run(
        [executable, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    checked = []
    errors = []
    missing = []
    for asset in manifest["assets"]:
        raw = asset["expectedOutputPath"]
        path = REPO / raw
        exists = path.is_file()
        result = {"assetId": asset["assetId"], "path": raw, "status": asset["currentStatus"], "exists": exists}
        if not exists:
            missing.append(asset["assetId"])
            if asset["currentStatus"] in REQUIRES_FILE:
                errors.append(f"{asset['assetId']}: status {asset['currentStatus']} but output is missing")
            checked.append(result)
            continue
        result["bytes"] = path.stat().st_size
        result["sha256"] = sha256(path)
        if asset["checksum"] and asset["checksum"] != result["sha256"]:
            errors.append(f"{asset['assetId']}: checksum mismatch")
        if path.suffix.lower() in MEDIA_EXTENSIONS:
            try:
                metadata = ffprobe(path)
                result["streams"] = metadata.get("streams", [])
                result["format"] = metadata.get("format", {})
                if not result["streams"]:
                    errors.append(f"{asset['assetId']}: media has no decodable streams")
            except Exception as error:
                errors.append(f"{asset['assetId']}: media validation failed: {error}")
        checked.append(result)
    payload = {"checked": len(checked), "present": sum(item["exists"] for item in checked), "missing": len(missing), "errors": errors, "items": checked}
    REPORT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: payload[key] for key in ("checked", "present", "missing", "errors")}, indent=2))
    if errors:
        raise SystemExit("output validation failed")


if __name__ == "__main__":
    main()
