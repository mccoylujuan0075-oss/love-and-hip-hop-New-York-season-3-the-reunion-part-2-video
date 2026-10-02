#!/usr/bin/env bash
#
# video-converter.sh — convert the promo/episode video between supported containers
# using the repository's house specs (1080p, 29.97 fps, H.264, AAC 128 kbps).
#
# Usage:
#   ./scripts/video-converter.sh input.mp4 output.m4v [options]
#   ./scripts/video-converter.sh --info input.mp4
#
# Options:
#   --resolution WxH      default 1920x1080
#   --fps FPS             default 30000/1001 (29.97)
#   --crf N               default 20
#   --audio-bitrate B     default 128k
#   --preset P            default medium
#
# Supported output containers: mp4 m4v mkv avi mov
#
set -euo pipefail

FFMPEG="${FFMPEG:-$(command -v ffmpeg || true)}"
if [[ -z "$FFMPEG" ]]; then
  FFMPEG="$(python3 -c 'import imageio_ffmpeg,sys; sys.stdout.write(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || true)"
fi
if [[ -z "$FFMPEG" ]]; then
  FFMPEG="$(ls "$HOME"/.cache/ffwheel/imageio_ffmpeg/binaries/ffmpeg-* 2>/dev/null | head -1 || true)"
fi
[[ -n "$FFMPEG" ]] || { echo "ERROR: ffmpeg not found." >&2; exit 1; }

if [[ "${1:-}" == "--info" ]]; then
  [[ -n "${2:-}" ]] || { echo "usage: $0 --info <file>" >&2; exit 2; }
  exec "$FFMPEG" -hide_banner -i "$2"
fi

[[ $# -ge 2 ]] || { grep '^#' "$0" | sed 's/^# \?//'; exit 2; }
IN="$1"; OUT="$2"; shift 2

RES="1920x1080"; FPS="30000/1001"; CRF="20"; AB="128k"; PRESET="medium"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resolution)    RES="$2"; shift 2;;
    --fps)           FPS="$2"; shift 2;;
    --crf)           CRF="$2"; shift 2;;
    --audio-bitrate) AB="$2"; shift 2;;
    --preset)        PRESET="$2"; shift 2;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
done

[[ -f "$IN" ]] || { echo "ERROR: input not found: $IN" >&2; exit 1; }
EXT="${OUT##*.}"; EXT="${EXT,,}"
case "$EXT" in
  mp4|m4v|mkv|avi|mov) ;;
  *) echo "ERROR: unsupported output container '.$EXT' (use mp4 m4v mkv avi mov)" >&2; exit 1;;
esac

VCODEC="libx264"; ACODEC="aac"
if [[ "$EXT" == "avi" ]]; then ACODEC="mp3"; fi   # AAC-in-AVI is poorly supported

RW="${RES%x*}"; RH="${RES#*x}"
[[ "$RW" =~ ^[0-9]+$ && "$RH" =~ ^[0-9]+$ ]] || { echo "ERROR: bad --resolution '$RES' (use WxH)" >&2; exit 1; }

echo "converting: $IN -> $OUT (${RES}, ${FPS} fps, ${VCODEC}, ${ACODEC} @ ${AB})"
"$FFMPEG" -y -hide_banner -loglevel error -i "$IN" \
  -vf "scale=${RW}:${RH}:force_original_aspect_ratio=decrease,pad=${RW}:${RH}:(ow-iw)/2:(oh-ih)/2" \
  -r "$FPS" -c:v "$VCODEC" -preset "$PRESET" -crf "$CRF" -pix_fmt yuv420p \
  -c:a "$ACODEC" -b:a "$AB" -ar 48000 -ac 2 \
  -movflags +faststart \
  "$OUT"
echo "wrote $OUT"
