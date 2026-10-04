#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-}"
OUT="${2:-}"

if [ -z "$ROOT" ] || [ -z "$OUT" ]; then
  echo "usage: $0 <retained-media-dir> <review-output-dir>" >&2
  exit 64
fi

test -d "$ROOT" || { echo "retained-media directory does not exist" >&2; exit 66; }
# Review evidence must be written to a new directory. Never erase retained
# media or an earlier review when a caller passes the wrong output path.
if [ -e "$OUT" ] || [ -L "$OUT" ]; then
  echo "review output already exists; choose a new directory" >&2
  exit 64
fi

command -v ffprobe >/dev/null 2>&1 || { echo "ffprobe required" >&2; exit 69; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg required" >&2; exit 69; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum required" >&2; exit 69; }
command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 69; }
command -v node >/dev/null 2>&1 || { echo "node required" >&2; exit 69; }

mkdir -p -- "$(dirname -- "$OUT")"
# Atomic creation also rejects a path introduced after the check above.
mkdir -- "$OUT"
mkdir -- "$OUT/frames"

manifest="$OUT/media-validation.json"
tmp="$OUT/.items.jsonl"
: > "$tmp"

expected=(S01_PUSH S02_PULLBACK S03_LEFT S04_RIGHT S05_CW_ARC S06_CCW_ARC S07_ELEVATION S08_DIAGONAL)

for id in "${expected[@]}"; do
  mapfile -t matches < <(find "$ROOT" -maxdepth 1 -type f -name "${id}-*.mp4" -print | sort)
  if [ "${#matches[@]}" -ne 1 ]; then
    echo "expected exactly one retained MP4 for $id; found ${#matches[@]}" >&2
    exit 1
  fi
  media="${matches[0]}"
  probe="$OUT/${id}.ffprobe.json"
  ffprobe -v error -print_format json -show_format -show_streams "$media" > "$probe"

  duration="$(jq -r '.format.duration // empty' "$probe")"
  video_streams="$(jq '[.streams[] | select(.codec_type=="video")] | length' "$probe")"
  width="$(jq -r '[.streams[] | select(.codec_type=="video")][0].width // 0' "$probe")"
  height="$(jq -r '[.streams[] | select(.codec_type=="video")][0].height // 0' "$probe")"
  codec="$(jq -r '[.streams[] | select(.codec_type=="video")][0].codec_name // ""' "$probe")"
  pix_fmt="$(jq -r '[.streams[] | select(.codec_type=="video")][0].pix_fmt // ""' "$probe")"

  node -e 'const d=Number(process.argv[1]); if(!Number.isFinite(d)||d<4||d>30) process.exit(1)' "$duration" || {
    echo "$id invalid duration: $duration" >&2
    exit 1
  }
  test "$video_streams" = "1" || { echo "$id must contain exactly one video stream" >&2; exit 1; }
  test "$width" -ge 640 || { echo "$id width too small: $width" >&2; exit 1; }
  test "$height" -ge 360 || { echo "$id height too small: $height" >&2; exit 1; }
  test -n "$codec" || { echo "$id codec missing" >&2; exit 1; }

  frame_dir="$OUT/frames/$id"
  mkdir -p "$frame_dir"
  # Sample five stable interior points, avoiding first/last-frame decoder artifacts.
  for pct in 10 30 50 70 90; do
    ts="$(node -e 'const d=Number(process.argv[1]),p=Number(process.argv[2]); process.stdout.write(String((d*p/100).toFixed(3)))' "$duration" "$pct")"
    ffmpeg -v error -ss "$ts" -i "$media" -frames:v 1 -vf "scale='min(1280,iw)':-2" -y "$frame_dir/frame-${pct}.jpg"
    test -s "$frame_dir/frame-${pct}.jpg" || { echo "$id frame $pct extraction empty" >&2; exit 1; }
  done

  contact="$OUT/${id}-contact-sheet.jpg"
  ffmpeg -v error     -i "$frame_dir/frame-10.jpg" -i "$frame_dir/frame-30.jpg" -i "$frame_dir/frame-50.jpg"     -i "$frame_dir/frame-70.jpg" -i "$frame_dir/frame-90.jpg"     -filter_complex "hstack=inputs=5" -y "$contact"
  test -s "$contact" || { echo "$id contact sheet empty" >&2; exit 1; }

  sha="$(sha256sum "$media" | awk '{print $1}')"
  bytes="$(stat -c%s "$media")"
  contact_sha="$(sha256sum "$contact" | awk '{print $1}')"

  jq -n     --arg id "$id"     --arg file "$(basename "$media")"     --arg codec "$codec"     --arg pixFmt "$pix_fmt"     --arg sha256 "$sha"     --arg contactSheet "$(basename "$contact")"     --arg contactSheetSha256 "$contact_sha"     --argjson width "$width"     --argjson height "$height"     --argjson bytes "$bytes"     --argjson durationSeconds "$duration"     '{
      id:$id,
      file:$file,
      sha256:$sha256,
      bytes:$bytes,
      codec:$codec,
      pixelFormat:$pixFmt,
      width:$width,
      height:$height,
      durationSeconds:$durationSeconds,
      sampledPercents:[10,30,50,70,90],
      contactSheet:$contactSheet,
      contactSheetSha256:$contactSheetSha256,
      literalVisualAcceptance:"pending-human-or-supported-visual-review",
      reconstructionSuitability:"pending-literal-motion-review"
    }' >> "$tmp"
done

jq -s '{
  schemaVersion:"urai-home-runway-survey-media-validation-v1",
  truthClass:"interpretive",
  autobiographical:false,
  surveyCount:length,
  structuralMediaValidation:"passed",
  literalVisualAcceptance:false,
  reconstructionSuitability:"pending-literal-motion-review",
  items:.
}' "$tmp" > "$manifest"
rm -f "$tmp"

test "$(jq -r '.surveyCount' "$manifest")" = "8"
echo "PASS: eight retained survey videos structurally validated and sampled for literal review"
