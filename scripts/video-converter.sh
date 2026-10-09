#!/usr/bin/env bash
# Convert a video to H.264 video and AAC 128 kbps audio.
#
# Usage: ./scripts/video-converter.sh input-file output-file
# Example: ./scripts/video-converter.sh input-file.mp4 output-file.m4v
#
# The output format follows the output file extension (.mp4, .m4v, .mov, .mkv).
# Requires ffmpeg on PATH.

set -euo pipefail

usage() {
  echo "Usage: $0 input-file output-file" >&2
  exit 1
}

[[ $# -eq 2 ]] || usage

input="$1"
output="$2"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg is not installed or not on PATH" >&2
  exit 1
fi

if [[ ! -f "$input" ]]; then
  echo "error: input file not found: $input" >&2
  exit 1
fi

if [[ -e "$output" ]]; then
  echo "error: output already exists: $output (remove it or choose another name)" >&2
  exit 1
fi

# -crf 20: visually high quality. -pix_fmt yuv420p: plays in most players.
# -movflags +faststart: lets the browser start playing before the file fully downloads.
ffmpeg -hide_banner -i "$input" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "$output"

echo "Wrote $output"
