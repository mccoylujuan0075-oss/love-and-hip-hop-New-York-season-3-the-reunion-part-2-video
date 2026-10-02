#!/usr/bin/env bash
#
# build-promo-video.sh — rebuild the sneak-peek promo MP4 + thumbnails + posters
#
# Produces (from scratch, no episode footage — only repo assets):
#   love-and-hip-hop-new-york-season-3-the-reunion-part-2.mp4   (1920x1080, 29.97fps, H.264, AAC 128k)
#   assets/thumbnails/thumb-0*.jpg                              (1280x720 frame grabs)
#   assets/posters/poster-1920x1080.jpg  poster-1080x1920.jpg
#
# Requirements: ImageMagick (convert), ffmpeg with libx264+aac (system ffmpeg or
#               the static build shipped in the imageio-ffmpeg wheel), bash.
#
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BUILD="$ROOT/build"
mkdir -p "$BUILD" assets/thumbnails assets/posters

# ---------------------------------------------------------------- locate ffmpeg
FFMPEG="${FFMPEG:-}"
if [[ -z "$FFMPEG" ]]; then
  FFMPEG="$(command -v ffmpeg || true)"
fi
if [[ -z "$FFMPEG" ]]; then
  FFMPEG="$(python3 -c 'import imageio_ffmpeg,sys; sys.stdout.write(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || true)"
fi
if [[ -z "$FFMPEG" ]]; then
  FFMPEG="$(ls "$HOME"/.cache/ffwheel/imageio_ffmpeg/binaries/ffmpeg-* 2>/dev/null | head -1 || true)"
fi
[[ -n "$FFMPEG" && -x "$FFMPEG" ]] || { echo "ERROR: ffmpeg not found (install ffmpeg or pip install imageio-ffmpeg)" >&2; exit 1; }
echo "== ffmpeg: $FFMPEG"

CONVERT="$(command -v convert)"
GOLD='#E6C15C'; INK='#140524'; PURPLE_HI='#8A2BE2'; PURPLE_LO='#1E0836'
W=1920; H=1080
FPS='30000/1001'
OUT="$ROOT/love-and-hip-hop-new-york-season-3-the-reunion-part-2.mp4"

PHOTO="$ROOT/assets/source/screenshot-remastered-1920.jpg"
[[ -f "$PHOTO" ]] || PHOTO="$ROOT/screenshot16_9.jpg"

# ------------------------------------------------- 1. purple tufted-set backdrop
echo "== building set backdrop"
# diamond lattice tile with gold buttons (like the reunion set wall)
"$CONVERT" -size 240x240 xc:none \
  -stroke "$GOLD" -strokewidth 4 -fill none \
  -draw "path 'M 120 0 L 240 120 L 120 240 L 0 120 Z'" \
  -fill "$GOLD" -stroke none \
  -draw "circle 120,0 120,7"   -draw "circle 240,120 247,120" \
  -draw "circle 120,240 120,247" -draw "circle 0,120 7,120" \
  "$BUILD/tile.png"
"$CONVERT" -size ${W}x${H} "radial-gradient:${PURPLE_HI}-${PURPLE_LO}" "$BUILD/bg_base.png"
"$CONVERT" -size ${W}x${H} "tile:$BUILD/tile.png" -channel A -evaluate multiply 0.28 +channel "$BUILD/tile_faint.png"
"$CONVERT" "$BUILD/bg_base.png" "$BUILD/tile_faint.png" -compose over -composite \
  \( -size ${W}x${H} radial-gradient:white-black -level 25%,85% \) -compose multiply -composite \
  "$BUILD/bg.png"
# vertical variant for the social poster
"$CONVERT" -size 1080x1920 "radial-gradient:${PURPLE_HI}-${PURPLE_LO}" "$BUILD/bgv_base.png"
"$CONVERT" -size 1080x1920 "tile:$BUILD/tile.png" -channel A -evaluate multiply 0.28 +channel "$BUILD/tilev_faint.png"
"$CONVERT" "$BUILD/bgv_base.png" "$BUILD/tilev_faint.png" -compose over -composite \
  \( -size 1080x1920 radial-gradient:white-black -level 25%,85% \) -compose multiply -composite \
  "$BUILD/bgv.png"

# ------------------------------------------------------------- 2. title card
echo "== card: title"
"$CONVERT" "$BUILD/bg.png" \
  -fill 'rgba(10,2,20,0.55)' -draw "rectangle 0,290 ${W},800" \
  -stroke "$GOLD" -strokewidth 3 -draw "line 660,330 1260,330" -draw "line 660,760 1260,760" \
  -gravity center -font DejaVu-Sans-Bold \
  -fill "$GOLD"  -pointsize 46  -annotate +0-135 "V H 1   P R E S E N T S" \
  -fill '#FFFFFF' -pointsize 116 -annotate +0-25 "LOVE & HIP HOP" \
  -fill "$GOLD"  -pointsize 84  -annotate +0+80 "NEW YORK" \
  -font DejaVu-Sans -fill '#FFFFFF' -pointsize 42 -annotate +0+185 "SEASON 3   •   THE REUNION PART 2" \
  "$BUILD/card_title.png"

# ------------------------------------------------- 3. sneak peek A (wide still)
echo "== card: peek A"
"$CONVERT" "$BUILD/bg.png" \
  \( "$PHOTO" -resize 1500x -bordercolor "$GOLD" -border 5 -bordercolor "$INK" -border 12 \) \
  -gravity center -geometry +0-70 -composite \
  -gravity northwest -fill 'rgba(12,3,24,0.80)' -draw "rectangle 110,858 1330,1012" \
  -fill "$GOLD" -font DejaVu-Sans-Bold -pointsize 36 -annotate +150+878 "SNEAK PEEK" \
  -fill '#FFFFFF' -font DejaVu-Sans-Bold -pointsize 62 -annotate +150+922 "THE LADIES SOUND OFF" \
  "$BUILD/card_peek_a.png"

# ------------------------------------------------ 4. sneak peek B (tight still)
echo "== card: peek B"
"$CONVERT" "$BUILD/bg.png" \
  \( "$PHOTO" -crop 1000x562+300+100 +repage -resize 1500x -bordercolor "$GOLD" -border 5 -bordercolor "$INK" -border 12 \) \
  -gravity center -geometry +0-70 -composite \
  -gravity northwest -fill 'rgba(12,3,24,0.80)' -draw "rectangle 110,838 1420,1012" \
  -fill "$GOLD" -font DejaVu-Sans-Bold -pointsize 36 -annotate +150+858 "REUNION — PART 2" \
  -fill '#FFFFFF' -font DejaVu-Sans-Bold -pointsize 60 -annotate +150+902 "EVERY BEEF. EVERY BETRAYAL." \
  -font DejaVu-Sans -fill "$GOLD" -pointsize 34 -annotate +150+968 "Mon + 8/7c on VH1" \
  "$BUILD/card_peek_b.png"

# ------------------------------------------------------------- 5. end card
echo "== card: end"
"$CONVERT" "$BUILD/bg.png" \
  -fill 'rgba(10,2,20,0.60)' -draw "rectangle 0,300 ${W},790" \
  -stroke "$GOLD" -strokewidth 3 -draw "line 610,345 1310,345" -draw "line 610,745 1310,745" \
  -gravity center -font DejaVu-Sans-Bold \
  -fill '#FFFFFF' -pointsize 44  -annotate +0-120 "A L L   N E W" \
  -fill '#FFFFFF' -pointsize 66  -annotate +0-35 "LOVE & HIP HOP: THE REUNION PART 2" \
  -fill "$GOLD"  -pointsize 108 -annotate +0+80 "MON + 8/7C" \
  -fill "$GOLD"  -pointsize 60  -annotate +0+180 "ON VH1" \
  -font DejaVu-Sans -fill '#CBB7E8' -pointsize 30 -annotate +0+250 "Season 3 • Episode 14 • April 15, 2013" \
  "$BUILD/card_end.png"

# ------------------------------------------------------------- 6. encode video
echo "== encoding ${OUT##*/}"
PAD='(0.85+0.15*sin(2*PI*0.5*t))*(0.055*sin(2*PI*110*t)+0.075*sin(2*PI*220*t)+0.06*sin(2*PI*277.18*t)+0.06*sin(2*PI*329.63*t)+0.035*sin(2*PI*440*t)+0.02*sin(2*PI*554.37*t))'
"$FFMPEG" -y -hide_banner -loglevel error \
  -i "$BUILD/card_title.png" \
  -i "$BUILD/card_peek_a.png" \
  -i "$BUILD/card_peek_b.png" \
  -i "$BUILD/card_end.png" \
  -f lavfi -t 15.015 -i "aevalsrc=${PAD}:s=48000" \
  -filter_complex "\
[0:v]zoompan=z='min(1+0.0006*on,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=${W}x${H}:fps=${FPS},fade=t=in:st=0:d=0.5,fade=t=out:st=2.6:d=0.4,setsar=1[v0];\
[1:v]zoompan=z='min(1+0.00075*on,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=135:s=${W}x${H}:fps=${FPS},fade=t=in:st=0:d=0.4,fade=t=out:st=4.1:d=0.4,setsar=1[v1];\
[2:v]zoompan=z='max(1.10-0.00075*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=135:s=${W}x${H}:fps=${FPS},fade=t=in:st=0:d=0.4,fade=t=out:st=4.1:d=0.4,setsar=1[v2];\
[3:v]zoompan=z='min(1+0.0005*on,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=${W}x${H}:fps=${FPS},fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.5,setsar=1[v3];\
[v0][v1][v2][v3]concat=n=4:v=1:a=0[vc];\
[vc]format=yuv420p[v];\
[4:a]lowpass=f=2200,afade=t=in:st=0:d=1.0,afade=t=out:st=13.4:d=1.6,aresample=48000[a]" \
  -map "[v]" -map "[a]" \
  -r "$FPS" -c:v libx264 -preset medium -crf 20 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart \
  -metadata title="Love & Hip Hop: New York - Season 3: The Reunion Part 2 (Sneak Peek Promo)" \
  -metadata artist="Fan-made promo - mccoylujuan0075-oss" \
  -metadata comment="Built by scripts/build-promo-video.sh from repository assets; not episode footage." \
  "$OUT"

# ------------------------------------------------------- 7. thumbnails & posters
echo "== thumbnails + posters"
grab() { # grab <time> <out>
  "$FFMPEG" -y -hide_banner -loglevel error -ss "$1" -i "$OUT" -frames:v 1 -vf scale=1280:720 -q:v 3 "$2"
}
grab 1.5  assets/thumbnails/thumb-01-title.jpg
grab 5.2  assets/thumbnails/thumb-02-peek-a.jpg
grab 9.6  assets/thumbnails/thumb-03-peek-b.jpg
grab 13.6 assets/thumbnails/thumb-04-end-card.jpg
cp "$BUILD/card_title.png" "$BUILD/poster_src.png"
"$CONVERT" "$BUILD/card_title.png" -quality 92 assets/posters/poster-1920x1080.jpg
"$CONVERT" "$BUILD/bgv.png" \
  -fill 'rgba(10,2,20,0.55)' -draw "rectangle 0,150 1080,640" \
  -gravity center -font DejaVu-Sans-Bold \
  -fill "$GOLD" -pointsize 40 -annotate +0-560 "V H 1   P R E S E N T S" \
  -fill '#FFFFFF' -pointsize 86 -annotate +0-460 "LOVE & HIP HOP" \
  -fill "$GOLD" -pointsize 64 -annotate +0-360 "NEW YORK" \
  -fill '#FFFFFF' -font DejaVu-Sans -pointsize 36 -annotate +0-270 "SEASON 3 • THE REUNION PART 2" \
  \( "$PHOTO" -resize 940x -bordercolor "$GOLD" -border 4 -bordercolor "$INK" -border 10 \) \
  -gravity center -geometry +0+80 -composite \
  -gravity center -font DejaVu-Sans-Bold -fill "$GOLD" -pointsize 64 -annotate +0+560 "MON + 8/7C" \
  -fill '#FFFFFF' -pointsize 40 -annotate +0+640 "ON VH1" \
  -quality 92 assets/posters/poster-1080x1920.jpg

echo "== done"
"$FFMPEG" -hide_banner -i "$OUT" 2>&1 | sed -n '1,12p'
