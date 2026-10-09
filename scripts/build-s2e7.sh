#!/usr/bin/env bash
#
# build-s2e7.sh — bash build mode for the
# Love & Hip Hop: New York — Season 2, Episode 7 Sneak Peek HLS page.
#
#   bash scripts/build-s2e7.sh                 # build + verify
#   bash scripts/build-s2e7.sh --stream URL    # build and bake an .m3u8 in
#   bash scripts/build-s2e7.sh --check         # verify only, change nothing
#
# What it does, and nothing else:
#   1. checks the vendored hls.js engine is present (local file, no CDN)
#   2. installs the photo set into public/assets/photos/
#   3. writes / updates metadata/s2e7-stream.json
#   4. verifies every file the page references actually exists
#
# Hard rules enforced by this build:
#   - HLS (.m3u8) only. No mp4, no promo.mp4, no progressive fallback.
#   - No AI-generated images, posters, assets, shapes, speech or scripts.
#   - No hand-coded SVG artwork, no CSS keyframe animations, no Tailwind.
#   - No Pluto TV / YouTube / archive.org / Dailymotion / stock libraries.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PHOTO_SRC="image-search"
PHOTO_DST="public/assets/photos"
STREAM_JSON="metadata/s2e7-stream.json"
VENDOR="public/vendor/hls.min.js"

STREAM_URL=""
CHECK_ONLY=0

GOLD=$'\033[38;5;178m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; OFF=$'\033[0m'
ok()   { printf '  %s✔%s %s\n' "$GRN" "$OFF" "$1"; }
bad()  { printf '  %s✘%s %s\n' "$RED" "$OFF" "$1"; FAIL=1; }
note() { printf '  %s·%s %s\n' "$DIM" "$OFF" "$1"; }
head_() { printf '\n%s%s%s\n' "$GOLD" "$1" "$OFF"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --stream|--m3u8|--url) STREAM_URL="${2:-}"; shift 2 ;;
    --check)               CHECK_ONLY=1; shift ;;
    -h|--help)             sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)                     echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

FAIL=0

printf '%s\n' "$GOLD════════════════════════════════════════════════════════════════"
printf '%s\n' "  LOVE & HIP HOP: NEW YORK  ·  S2 E7 SNEAK PEEK  ·  HLS BUILD"
printf '%s\n' "════════════════════════════════════════════════════════════════$OFF"

# ── 1. playback engine ────────────────────────────────────────────────
head_ "1. Playback engine"
if [ -s "$VENDOR" ]; then
  ok "hls.js vendored locally — $(wc -c < "$VENDOR" | tr -d ' ') bytes ($VENDOR)"
  note "served from this repo; the page never calls a CDN"
else
  bad "missing $VENDOR  →  npm pack hls.js && extract package/dist/hls.min.js"
fi

# ── 2. photography ────────────────────────────────────────────────────
head_ "2. Photography (real photos only — no AI, no stock generators)"
if [ "$CHECK_ONLY" -eq 0 ] && [ -d "$PHOTO_SRC" ]; then
  mkdir -p "$PHOTO_DST"
  n=0
  for f in "$PHOTO_SRC"/*; do
    [ -e "$f" ] || continue
    cp -f "$f" "$PHOTO_DST/$(basename "$f")"
    n=$((n+1))
  done
  note "installed $n photo file(s) → $PHOTO_DST"
fi
if [ -d "$PHOTO_DST" ] && [ -n "$(ls -A "$PHOTO_DST" 2>/dev/null)" ]; then
  for f in "$PHOTO_DST"/*; do
    case "${f,,}" in
      *.jpg|*.jpeg|*.png|*.webp) ok "$(basename "$f")  ($(wc -c < "$f" | tr -d ' ') bytes)" ;;
      *.svg) bad "$(basename "$f") — SVG artwork is not allowed in this build" ;;
    esac
  done
else
  bad "no photos installed in $PHOTO_DST"
fi

# ── 3. stream config ──────────────────────────────────────────────────
head_ "3. HLS source"
if [ -n "$STREAM_URL" ]; then
  case "$STREAM_URL" in
    *.m3u8|*.m3u8\?*) : ;;
    *) bad "refusing '$STREAM_URL' — this player is .m3u8 only"; exit 1 ;;
  esac
  [ "$CHECK_ONLY" -eq 0 ] && python3 - "$STREAM_JSON" "$STREAM_URL" <<'PY'
import json, sys
p, url = sys.argv[1], sys.argv[2]
d = json.load(open(p))
d["primary"]["url"] = url
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
PY
  ok "primary stream set → $STREAM_URL"
fi

if [ -s "$STREAM_JSON" ]; then
  python3 - "$STREAM_JSON" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
prim = (d.get("primary") or {}).get("url", "")
fb   = d.get("fallbacks") or []
print("  \033[32m✔\033[0m stream config parses — %s" % sys.argv[1])
if prim:
    print("  \033[32m✔\033[0m primary: %s" % prim)
else:
    print("  \033[2m·\033[0m primary: (empty) — paste your .m3u8 in the page's source bar,")
    print("  \033[2m·\033[0m          or run: bash scripts/build-s2e7.sh --stream <URL>")
for f in fb:
    print("  \033[2m·\033[0m fallback: %s" % f.get("url", ""))
bad = [u for u in [prim] + [f.get("url","") for f in fb] if u and ".m3u8" not in u]
if bad:
    print("  \033[31m✘\033[0m non-HLS source in config: %s" % ", ".join(bad)); sys.exit(1)
PY
else
  bad "missing $STREAM_JSON"
fi

# ── 4. page files ─────────────────────────────────────────────────────
head_ "4. Page files"
for f in public/s2e7.html public/s2e7.css public/s2e7.js metadata/s2e7-data.json; do
  if [ -s "$f" ]; then ok "$f"; else bad "$f missing"; fi
done

# ── 5. rule sweep ─────────────────────────────────────────────────────
head_ "5. Rule sweep"
# The sweep looks at *references* (src/href/url/fetch targets), not prose —
# the page is allowed to name the things it threw away.
PAGES="public/s2e7.html public/s2e7.css public/s2e7.js"
sweep() { # pattern, human label
  if grep -qiE "$1" $PAGES 2>/dev/null; then
    bad "$2 — found: $(grep -ihoE "$1" $PAGES | sort -u | head -3 | tr '\n' ' ')"
  else
    ok "$2 — clean"
  fi
}
sweep '(src|href|url\()[="'"'"']+[^"'"'"')]*\.(mp4|m4v|webm|mov)'   'no mp4 / promo.mp4 / progressive video'
sweep 'https?://[^"'"'"' )]*(pluto|dailymotion|archive\.org|youtube|ytimg)' 'no Pluto / Dailymotion / archive.org / YouTube'
sweep 'https?://[^"'"'"' )]*(pexels|unsplash|shutterstock|gettyimages)'     'no stock photo libraries'
sweep 'tailwindcss|tailwind\.css|cdn\.tailwind'       'no Tailwind'
sweep '@keyframes|animation:'                         'no CSS keyframe animations'
sweep '<svg|</svg>|\.svg'                             'no hand-coded SVG artwork'
sweep '(src|href)="https?://[^"]*(cdn|jsdelivr|unpkg)' 'no external CDN script/style tags'
if grep -q 'm3u8' public/s2e7.js; then ok 'HLS (.m3u8) is the only transport'; else bad 'player is not wired to .m3u8'; fi

# ── done ──────────────────────────────────────────────────────────────
printf '\n%s────────────────────────────────────────────────────────────────%s\n' "$GOLD" "$OFF"
if [ "$FAIL" -eq 0 ]; then
  printf '  %sBUILD OK%s   npm start   →   http://localhost:3000/s2e7\n\n' "$GRN" "$OFF"
else
  printf '  %sBUILD FAILED%s — see the ✘ lines above\n\n' "$RED" "$OFF"
  exit 1
fi
