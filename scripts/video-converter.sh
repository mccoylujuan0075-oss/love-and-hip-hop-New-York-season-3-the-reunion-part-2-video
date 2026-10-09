#!/usr/bin/env bash
# =====================================================================
# video-converter.sh — Love & Hip Hop: New York S3E14 "Reunion: Part 2"
#
# Convert / remux the episode file between the containers this repo
# supports (MP4, M4V, MKV, AVI, MOV) and produce a web-ready MP4 that
# browsers can stream with byte-range requests.
#
#   ./scripts/video-converter.sh YouTube.mp4 YouTube.m4v
#   ./scripts/video-converter.sh YouTube.mp4 web/YouTube.mp4 --web
#   ./scripts/video-converter.sh --inspect YouTube.mp4
#   ./scripts/video-converter.sh --help
#
# Requires ffmpeg (and ffprobe for --inspect).
# =====================================================================
set -euo pipefail

VERSION="1.0.0"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Target profile, mirrored in metadata/episode-data.json -> media.specs
TARGET_RES="1920x1080"
TARGET_FPS="30000/1001"      # 29.97
TARGET_VBITRATE="6000k"
TARGET_ABITRATE="128k"
TARGET_BSF="aac_adtstoasc"

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '%s!%s %s\n' "$C_WARN" "$C_OFF" "$*"; }
die()  { printf '%s✗%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }
dim()  { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }

usage() {
  cat <<EOF

Love & Hip Hop: New York — S3E14 video converter v${VERSION}

USAGE
  $(basename "$0") <input> <output> [options]
  $(basename "$0") --inspect <input>
  $(basename "$0") --help

OPTIONS
  --web         Web-ready profile: H.264 High@4.1, AAC 128k, +faststart, 1080p29.97
  --copy        Remux only (no re-encode). Fastest; keeps original quality.
  --scale WxH   Override output resolution (e.g. --scale 1280x720)
  --crf N       Use quality-based encoding instead of a fixed bitrate (default 20)
  --mute        Strip audio
  --inspect     Probe the input and print a report; writes nothing
  -h, --help    This message

EXAMPLES
  $(basename "$0") YouTube.mp4 YouTube.m4v
  $(basename "$0") YouTube.mp4 public/YouTube.web.mp4 --web
  $(basename "$0") YouTube.mkv YouTube.mp4 --copy
  $(basename "$0") --inspect YouTube.mp4

All new Love and Hip Hop: The Reunion Part 2 Mon + 8/7C on VH1.
EOF
}

need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed.${2:+ $2}"; }

INSPECT=0; WEB=0; COPY=0; MUTE=0; CRF=""; SCALE=""
INPUT=""; OUTPUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --inspect) INSPECT=1; shift ;;
    --web)     WEB=1; shift ;;
    --copy)    COPY=1; shift ;;
    --mute)    MUTE=1; shift ;;
    --crf)     CRF="${2:-}"; shift 2 ;;
    --scale)   SCALE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*)        die "Unknown option: $1 (try --help)" ;;
    *)         if [ -z "$INPUT" ]; then INPUT="$1"; else OUTPUT="$1"; fi; shift ;;
  esac
done

[ -n "$INPUT" ] || { usage; exit 1; }
[ -f "$INPUT" ] || die "Input file not found: $INPUT"
[ "$INSPECT" -eq 1 ] || [ -n "$OUTPUT" ] || die "Output path required (or use --inspect)."

if [ "$INSPECT" -eq 1 ]; then
  need ffprobe "Install ffmpeg (https://ffmpeg.org/download.html)."
  say ""
  say "┌─ ${INPUT}"
  say "│"
  ffprobe -v error -show_entries format=format_name,duration,size,bit_rate \
          -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate \
          -of default=noprint_wrappers=1 "$INPUT" | sed 's/^/│  /'
  say "│"
  ok "Probe complete"
  say ""
  exit 0
fi

need ffmpeg "Install ffmpeg (https://ffmpeg.org/download.html)."
[ "$INSPECT" -eq 0 ] || true
[ "$OUTPUT" != "$INPUT" ] || die "Input and output are the same file."

mkdir -p "$(dirname "$OUTPUT")"

ARGS=(-hide_banner -nostdin -y -i "$INPUT")

if [ "$COPY" -eq 1 ]; then
  dim "Mode: remux only (no re-encode)"
  ARGS+=(-c copy)
else
  dim "Mode: re-encode$([ "$WEB" -eq 1 ] && echo ' (web-ready profile)')"
  if [ -n "$CRF" ]; then
    ARGS+=(-c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p)
  else
    ARGS+=(-c:v libx264 -preset slow -b:v "$TARGET_VBITRATE" -maxrate "$TARGET_VBITRATE" -bufsize 12M -pix_fmt yuv420p)
  fi
  ARGS+=(-profile:v high -level 4.1 -r "$TARGET_FPS")
  if [ -n "$SCALE" ]; then
    ARGS+=(-vf "scale=${SCALE}:flags=lanczos")
  elif [ "$WEB" -eq 1 ]; then
    # Fit inside 1080p without upscaling, keep even dimensions for H.264.
    ARGS+=(-vf "scale=w='min(${TARGET_RES%%x*}*1,iw)':h='min(${TARGET_RES##*x}*1,ih)':force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2")
  fi
fi

if [ "$MUTE" -eq 1 ]; then
  ARGS+=(-an)
elif [ "$COPY" -eq 1 ]; then
  ARGS+=(-c:a copy)
else
  ARGS+=(-c:a aac -b:a "$TARGET_ABITRATE" -ac 2)
fi

# Faststart puts the moov atom first — required for progressive streaming.
ARGS+=(-movflags +faststart -metadata "title=Love & Hip Hop: New York — The Reunion, Part 2" \
       -metadata "show=Love & Hip Hop: New York" -metadata "season_number=3" \
       -metadata "episode_id=14" -metadata "network=VH1")

say ""
printf '  %s → %s\n\n' "$INPUT" "$OUTPUT"
ffmpeg "${ARGS[@]}" "$OUTPUT"

SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
HUMAN=$(awk -v b="$SIZE" 'BEGIN { split("B KB MB GB TB", u, " "); i=1; while (b>=1024 && i<5) { b/=1024; i++ } printf "%.1f %s", b, u[i] }')
say ""
ok "Wrote ${OUTPUT} (${HUMAN})"
if [ "$WEB" -eq 1 ] || [ "$COPY" -eq 1 ]; then
  dim "  moov atom first: browsers can start playing before the whole file downloads."
fi
dim "  Serve it with: npm start   (the player picks up YouTube.mp4 in the repo root automatically)"
say ""
