#!/usr/bin/env bash
# =====================================================================
# make-placeholder-reel.sh — generate an ORIGINAL placeholder MP4
#
# Builds a fully playable, clearly-labelled stand-in video so the watch
# page, chapters, seeking, resume and the whole player pipeline can be
# demonstrated before the real episode file is in the repository.
#
# The reel contains only original generated graphics and text. It is
# watermarked "PLACEHOLDER" throughout and is never passed off as the
# real episode.
#
# USAGE
#   ./scripts/make-placeholder-reel.sh \
#       --show "Basketball Wives" \
#       --subtitle "The Reunion · Sneak Peek" \
#       --out media/placeholder/basketball-wives-reunion-reel.mp4 \
#       --poster public/assets/posters/basketball-wives-reunion-reel.jpg \
#       --chapters metadata/basketball-wives-timestamps.json
#
# OPTIONS
#   --show TEXT       Show name printed on the cards      (required)
#   --subtitle TEXT   Second line under the show name     (default: Reunion Sneak Peek)
#   --out PATH        Output mp4                          (required)
#   --duration SEC    Total length in seconds             (default: 151)
#   --crf N           x264 quality, lower = better        (default: 30)
#   --font FILE       Bold TTF for the cards              (auto-detected)
#   --poster PATH     Also write a 16:9 poster jpg
#   --chapters PATH   Also write a chapters JSON matching this reel
#   --silent          No ambient audio bed
#   -h, --help        This message
#
# Requires ffmpeg (built with libfreetype) and, for the court artwork,
# ImageMagick.
# =====================================================================
set -euo pipefail

SHOW=""; SUBTITLE="Reunion Sneak Peek"; OUT=""; DURATION=151; CRF=30
FONT=""; POSTER=""; CHAPTERS=""; SILENT=0
FPS="30000/1001"

C_OK=$'\033[32m'; C_DIM=$'\033[2m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'
ok()  { printf '%s✓%s %s\n' "$C_OK" "$C_OFF" "$*"; }
dim() { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }
die() { printf '%s✗%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

usage() { sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --show)     SHOW="${2:-}"; shift 2 ;;
    --subtitle) SUBTITLE="${2:-}"; shift 2 ;;
    --out)      OUT="${2:-}"; shift 2 ;;
    --duration) DURATION="${2:-}"; shift 2 ;;
    --crf)      CRF="${2:-}"; shift 2 ;;
    --font)     FONT="${2:-}"; shift 2 ;;
    --poster)   POSTER="${2:-}"; shift 2 ;;
    --chapters) CHAPTERS="${2:-}"; shift 2 ;;
    --silent)   SILENT=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          die "Unknown option: $1 (try --help)" ;;
  esac
done

[ -n "$SHOW" ] || die "--show is required"
[ -n "$OUT" ]  || die "--out is required"
command -v ffmpeg >/dev/null 2>&1 || die "ffmpeg is required"

if [ -z "$FONT" ]; then
  for f in /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
           /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
           /System/Library/Fonts/Supplemental/Arial\ Bold.ttf \
           /Library/Fonts/Arial\ Bold.ttf; do
    [ -f "$f" ] && FONT="$f" && break
  done
fi
[ -n "$FONT" ] && [ -f "$FONT" ] || die "no bold TTF found — pass --font /path/to/font.ttf"
ok "font $FONT"

mkdir -p "$(dirname "$OUT")"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── original court artwork (optional) ───────────────────────────────────
COURT=""; BALL=""
export MAGICK_TMPDIR="$WORK"
if command -v convert >/dev/null 2>&1; then
  # translucent strokes drawn directly (an alpha-channel multiply here can
  # spawn multi-gigabyte temp files on some ImageMagick builds)
  if convert -size 1920x1080 xc:none \
      -stroke 'rgba(240,180,41,0.22)' -strokewidth 4 -fill none \
      -draw "rectangle 120,120 1800,960" \
      -draw "line 960,120 960,960" \
      -draw "circle 960,540 960,300" \
      -draw "arc 1180,150 1980,1020 120 250" \
      -draw "arc 740,150 -60,1020 290 60" \
      "$WORK/court.png" 2>/dev/null; then
    COURT="$WORK/court.png"; ok "court overlay rendered"
  else
    dim "court artwork failed — continuing without it"
  fi

  if convert -size 150x150 xc:none \
      -fill '#e2711d' -stroke '#7a2f05' -strokewidth 3 \
      -draw "circle 75,75 75,9" \
      -stroke '#4a1d02' -strokewidth 3 -fill none \
      -draw "line 5,75 145,75" \
      -draw "line 75,5 75,145" \
      -draw "arc 32,-32 118,96 140 320" \
      -draw "arc 32,54 118,182 220 40" \
      "$WORK/ball.png" 2>/dev/null; then
    BALL="$WORK/ball.png"; ok "ball sprite rendered"
  fi
else
  dim "ImageMagick not found — skipping court artwork"
fi

# ── segment boundaries (fractions of the runtime) ───────────────────────
D=$DURATION
seg() { awk -v d="$D" -v f="$1" 'BEGIN { printf "%.2f", d*f }'; }
S1=$(seg 0.00); S2=$(seg 0.06); S3=$(seg 0.20); S4=$(seg 0.36)
S5=$(seg 0.52); S6=$(seg 0.68); S7=$(seg 0.84); S8=$(seg 0.94)

# drawtext escaping: : ' , and \ all have meaning inside a filter string.
# RAW=1 skips escaping, for ffmpeg text expansions like %{pts\:hms}.
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/:/\\\\:/g" -e "s/'/\\\\'/g" -e 's/,/\\,/g'; }
FONT_ESC=$(esc "$FONT")
SHOW_ESC=$(esc "$SHOW")
SUB_ESC=$(esc "$SUBTITLE")

dt() { # size colour y text [enable] [raw] -> drawtext filter string
  local size="$1" colour="$2" ypos="$3" body="$4" enable="${5:-}" raw="${6:-}"
  local text
  if [ "$raw" = "1" ]; then text="$body"; else text="$(esc "$body")"; fi
  local out="drawtext=fontfile='${FONT_ESC}':text='${text}':fontsize=${size}:fontcolor=${colour}:x=(w-text_w)/2:y=${ypos}"
  [ -n "$enable" ] && out="${out}:enable='${enable}'"
  printf '%s' "$out"
}
en() { printf 'between(t\\,%s\\,%s)' "$1" "$2"; }
Y_BIG=430; Y_HEAD=470; Y_SUB=575; Y_TAG=670

# ── build the filtergraph ───────────────────────────────────────────────
IDX=1
COURT_IDX=""; BALL_IDX=""; AUDIO_IDX=""
[ -n "$COURT" ] && { COURT_IDX=$IDX; IDX=$((IDX+1)); }
[ -n "$BALL" ]  && { BALL_IDX=$IDX;  IDX=$((IDX+1)); }
[ "$SILENT" -eq 0 ] && { AUDIO_IDX=$IDX; IDX=$((IDX+1)); }

FC="[0:v]setsar=1[base]"
LAST="base"
if [ -n "$COURT_IDX" ]; then
  FC="${FC};[${LAST}][${COURT_IDX}:v]overlay=0:0[court]"; LAST="court"
fi

# scrim + every text layer
TXT="drawbox=x=0:y=0:w=1920:h=1080:color=black@0.46:t=fill"
# persistent watermark + running timecode
TXT="${TXT},$(dt 26 '#f0b429' 34 'PLACEHOLDER REEL — NOT THE EPISODE' '1')"
TXT="${TXT},$(dt 21 '#9a9a9a' 78 '%{pts\:hms}    frame %{n}' '1' 1)"
TXT="${TXT},$(dt 20 '#7a7a7a' 1040 'generated for this repository — original graphics, no broadcast footage' '1')"
# segment cards
TXT="${TXT},$(dt 118 '#ffffff' "$Y_BIG" "$SHOW" "$(en "$S1" "$S2")")"
TXT="${TXT},$(dt 54 '#f0b429' "$Y_SUB" "$SUBTITLE" "$(en "$S1" "$S2")")"
TXT="${TXT},$(dt 32 '#ff5a5f' "$Y_TAG" 'PLACEHOLDER' "$(en "$S1" "$S2")")"
TXT="${TXT},$(dt 74 '#ffffff' "$Y_HEAD" 'What you are watching' "$(en "$S2" "$S3")")"
TXT="${TXT},$(dt 38 '#d8d8d8' "$Y_SUB" 'An original placeholder reel generated for this repository.' "$(en "$S2" "$S3")")"
TXT="${TXT},$(dt 74 '#ffffff' "$Y_HEAD" 'Why it exists' "$(en "$S3" "$S4")")"
TXT="${TXT},$(dt 38 '#d8d8d8' "$Y_SUB" 'The real episode file is not in the repository yet.' "$(en "$S3" "$S4")")"
TXT="${TXT},$(dt 74 '#ffffff' "$Y_HEAD" 'Swap it in' "$(en "$S4" "$S5")")"
TXT="${TXT},$(dt 38 '#d8d8d8' "$Y_SUB" 'Drop your video in the repo and reload — this reel steps aside.' "$(en "$S4" "$S5")")"
TXT="${TXT},$(dt 74 '#ffffff' "$Y_HEAD" 'What is wired up' "$(en "$S5" "$S6")")"
TXT="${TXT},$(dt 38 '#d8d8d8' "$Y_SUB" 'Player · chapters · seeking · resume · cast grid · episode data' "$(en "$S5" "$S6")")"
TXT="${TXT},$(dt 74 '#ffffff' "$Y_HEAD" 'Try it' "$(en "$S6" "$S7")")"
TXT="${TXT},$(dt 38 '#d8d8d8' "$Y_SUB" 'Scrub the bar · press 1-9 for chapters · F fullscreen · T theater' "$(en "$S6" "$S7")")"
TXT="${TXT},$(dt 74 '#ffffff' "$Y_HEAD" 'Chapters are live' "$(en "$S7" "$S8")")"
TXT="${TXT},$(dt 38 '#d8d8d8' "$Y_SUB" 'The markers on the timeline match this reel exactly.' "$(en "$S7" "$S8")")"
TXT="${TXT},$(dt 96 '#f0b429' "$Y_HEAD" 'Replace me' "$(en "$S8" "$D")")"
TXT="${TXT},$(dt 38 '#d8d8d8' "$Y_SUB" 'Put your real file in the repository and reload.' "$(en "$S8" "$D")")"

if [ -n "$BALL_IDX" ]; then
  FC="${FC};[${LAST}]${TXT}[txt];[txt][${BALL_IDX}:v]overlay=x='W-w-90':y='H-250+170*abs(sin(2*PI*t/2.6))'[out]"
else
  FC="${FC};[${LAST}]${TXT}[out]"
fi
if [ -n "$AUDIO_IDX" ]; then
  FC="${FC};[${AUDIO_IDX}:a]lowpass=f=520,volume=1.6[aud]"
fi

# ── inputs ──────────────────────────────────────────────────────────────
IN=(-f lavfi -i "color=c=0x0a0a0a:s=1920x1080:r=${FPS}:d=${D}")
[ -n "$COURT" ] && IN+=(-loop 1 -i "$COURT")
[ -n "$BALL" ]  && IN+=(-loop 1 -i "$BALL")
[ "$SILENT" -eq 0 ] && IN+=(-f lavfi -i "anoisesrc=c=pink:a=0.05:r=48000:d=${D}")

MAP=(-map '[out]')
[ "$SILENT" -eq 0 ] && MAP+=(-map '[aud]' -c:a aac -b:a 96k -ac 2)

echo ""
dim "Rendering a ${DURATION}s placeholder reel → $OUT"
ffmpeg -hide_banner -loglevel error -nostdin -y \
  "${IN[@]}" \
  -filter_complex "$FC" \
  "${MAP[@]}" \
  -c:v libx264 -preset veryfast -crf "$CRF" -g 60 -pix_fmt yuv420p \
  -movflags +faststart \
  -metadata "title=${SHOW} — ${SUBTITLE} (placeholder reel)" \
  -metadata "comment=Original generated placeholder reel. Not the broadcast episode." \
  -t "$D" \
  "$OUT"

[ -s "$OUT" ] || die "render produced no output"
SIZE=$(wc -c < "$OUT" | tr -d ' ')
HUMAN=$(awk -v b="$SIZE" 'BEGIN { split("B KB MB GB",u," "); i=1; while (b>=1024 && i<4) { b/=1024; i++ } printf "%.1f %s", b, u[i] }')
ok "wrote $OUT (${HUMAN})"

# ── optional poster ─────────────────────────────────────────────────────
if [ -n "$POSTER" ] && command -v convert >/dev/null 2>&1; then
  mkdir -p "$(dirname "$POSTER")"
  convert -size 1920x1080 gradient:'#241704-#000000' \
    ${COURT:+\( "$COURT" \) -composite} \
    -font "$FONT" -gravity center -stroke none \
    -fill '#f0b429' -pointsize 132 -annotate +0-110 "$SHOW" \
    -fill '#ffffff' -pointsize 58 -annotate +0+20 "$SUBTITLE" \
    -fill '#ff5a5f' -pointsize 32 -annotate +0+120 "PLACEHOLDER REEL" \
    ${BALL:+\( "$BALL" \) -gravity southeast -geometry +120+95 -composite} \
    -resize 1280x720 -quality 88 "$POSTER"
  ok "wrote $POSTER"
fi

# ── optional chapters (real timecodes for this reel) ────────────────────
if [ -n "$CHAPTERS" ]; then
  mkdir -p "$(dirname "$CHAPTERS")"
  awk -v s1="$S1" -v s2="$S2" -v s3="$S3" -v s4="$S4" -v s5="$S5" -v s6="$S6" -v s7="$S7" -v s8="$S8" -v d="$D" '
    BEGIN {
      start[1]=s1; start[2]=s2; start[3]=s3; start[4]=s4
      start[5]=s5; start[6]=s6; start[7]=s7; start[8]=s8
      title[1]="Title Card";            blurb[1]="Show card and the placeholder warning."
      title[2]="What You Are Watching"; blurb[2]="An original placeholder reel generated for this repository."
      title[3]="Why It Exists";         blurb[3]="The real episode file is not in the repository yet."
      title[4]="Swap It In";            blurb[4]="Drop your video in the repo and reload - this reel steps aside."
      title[5]="What Is Wired Up";      blurb[5]="Player, chapters, seeking, resume, cast grid and episode data."
      title[6]="Try It";                blurb[6]="Scrub the bar, jump chapters, go fullscreen or theater."
      title[7]="Chapters Are Live";     blurb[7]="Timeline markers match this reel exactly."
      title[8]="Replace Me";            blurb[8]="Put your real file in the repository and reload."
      tag[1]="Intro"; tag[2]="About"; tag[3]="About"; tag[4]="How to"
      tag[5]="Features"; tag[6]="Demo"; tag[7]="Demo"; tag[8]="Outro"
      printf "{\n"
      printf "  \"_note\": \"REAL timecodes for the generated placeholder reel. Accurate for that file; replace the whole file when you drop the real video in.\",\n"
      printf "  \"_placeholder\": false,\n"
      printf "  \"_forPlaceholderReel\": true,\n"
      printf "  \"runtimeSeconds\": %d,\n", d
      printf "  \"runtimeLabel\": \"%d:%02d\",\n", int(d/60), int(d)%60
      printf "  \"chapters\": [\n"
      for (i=1;i<=8;i++) {
        end = (i<8) ? start[i+1] : d
        printf "    { \"id\": \"seg-%d\", \"title\": \"%s\", \"start\": %d, \"end\": %d, \"blurb\": \"%s\", \"tag\": \"%s\" }%s\n",
               i, title[i], int(start[i]+0.5), int(end+0.5), blurb[i], tag[i], (i<8 ? "," : "")
      }
      printf "  ]\n}\n"
    }' > "$CHAPTERS"
  ok "wrote $CHAPTERS"
fi

echo ""
