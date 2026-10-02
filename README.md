# Love & Hip Hop New York — Season 3: The Reunion Part 2

All new Love and Hip Hop: The Reunion Part 2 Mon + 8/7C on VH1

A complete, working watch page for the episode — `YouTube.mp4` in, cinematic player out.

[![Watch](https://img.shields.io/badge/watch-npm%20start-f0c75e)](#quick-start)
[![Episode](https://img.shields.io/badge/S3%20E14-Reunion%20Part%202-7c3aed)](#episode-details)
[![Video](https://img.shields.io/badge/video-YouTube.mp4-d4af37)](#where-youtubemp4-goes)
[![Deps](https://img.shields.io/badge/dependencies-none-22c55e)](#no-dependencies)

```bash
npm start          # → http://localhost:3000
```

---

## What this is

The repo started as a README and a screenshot. It is now a self-contained site built around one file:
**`YouTube.mp4`**. Everything else — the player, the chapter rail, the cast grid, the episode guide, the
metadata API, the container tooling — exists to present that file.

| | |
| --- | --- |
| **Watch page** | Custom player: byte-range seeking, chapters, deep links, resume, PiP, theater mode, keyboard control |
| **Streaming server** | Zero dependencies (Node built-ins only), HTTP 206 range support, hot-swaps the video with no restart |
| **Metadata API** | `/api/episode` and `/api/video-info` serve the JSON in `metadata/` to the page |
| **Tooling** | `metadata-parser.py` reads MP4 internals with no ffmpeg; `video-converter.sh` remuxes/re-encodes |
| **Docs** | Episode guide, cast & crew, run-of-show breakdown |

---

## Quick start

```bash
git clone <this repo>
cd love-and-hip-hop-New-York-season-3-the-reunion-part-2-video

# 1. put the episode next to this README
cp ~/Downloads/YouTube.mp4 .

npm start
```

Open **http://localhost:3000**. That's the whole setup — no install step, no build step, no dependencies.

If `YouTube.mp4` isn't there yet, the site still runs and the player shows a locker with three ways to get
video into it (see below). Nothing else on the page is blocked by it.

---

## Where `YouTube.mp4` goes

The server looks for the file in this order and picks the first one it finds:

1. `$VIDEO_FILE` — explicit path override
2. **`YouTube.mp4` in the repository root** ← this is the expected spot
3. Any other `.mp4` `.m4v` `.mkv` `.mov` `.avi` `.webm` in the root
4. `assets/videos/` · `assets/` · `media/` · `video/` · `public/` · `assets/media/` (same name first)
5. `$VIDEO_URL` — stream straight from a CDN instead of a local file

```bash
npm start                                  # picks up ./YouTube.mp4
VIDEO_FILE=~/Videos/episode.mp4 npm start  # or point at it anywhere
VIDEO_URL=https://host/YouTube.mp4 npm start   # or stream from elsewhere
```

**No restart needed while it runs.** The server re-scans on every request, so you can drop the file in while
the page is open and reload — the player switches from the locker to the episode. The player also accepts a
**drag-and-drop** of any local video, and a **file picker**, for previewing a copy without putting it on the
server at all.

> The full-length episode is intentionally **not** committed (`.gitignore` excludes video files — GitHub
> rejects files over 100 MB). The site is built to consume it, not to ship it.

### Video profile

Whatever you feed it, this is the profile the page advertises and the converter targets:

| Property | Value |
| --- | --- |
| Container | MP4 (`moov` atom first — faststart) |
| Resolution | 1920×1080 (1080p Full HD) |
| Frame rate | 29.97 fps |
| Video codec | H.264 (AVC), High profile |
| Audio codec | AAC, 128 kbps, stereo |
| Runtime | 42:00 (reunion-special slot) |
| Rating | TV-14 |

Anything the browser can decode will play — the player letterboxes, scales and seeks regardless.

---

## Episode details

| Field | Value |
| --- | --- |
| Show | Love & Hip Hop: New York |
| Season / Episode | 3 / 14 (series episode 34) |
| Title | Reunion: Part 2 |
| Type | Two-part reunion special, part 2 |
| Host | Mona Scott-Young |
| Original air date | Monday, April 15, 2013 |
| Time slot | 8/7c |
| Network | VH1 |
| Runtime | 42 minutes |
| US viewers | 2.35M |
| Rating | TV-14 |
| Part 1 | S3 E13 "The Reunion (Part I)" — April 9, 2013 |

> The drama unfolds as the ladies of *Love & Hip Hop NY* reunite to get into all the issues, the beef, and the
> madness that occurred during and after the cameras rolled.

Cast, crew, themes and the full 14-episode season guide live in
[`metadata/episode-data.json`](metadata/episode-data.json) and are rendered straight onto the page — edit the
JSON, reload, done.

---

## The watch page

A single page, no framework, ~30 KB of vanilla JS:

- **Player** — custom control bar (play/pause, ±10s, volume, scrub with chapter ticks, speed 0.5×–2×,
  picture-in-picture, fullscreen, theater mode) layered over the native `<video>` element
- **Chapters** — rail beside the player, markers on the progress bar, auto-highlighting, plus deep links
  like `/?t=630&chapter=love-triangle`
- **Resume** — remembers your position per browser and offers to pick up where you left off
- **Keyboard** — `Space` play · `←`/`→` 5s · `J`/`L` 10s · `↑`/`↓` volume · `M` mute · `F` fullscreen ·
  `P` PiP · `T` theater · `R` restart · `0`–`9` jump to chapter
- **Metadata-driven** — cast grid with role filters, "by the numbers", credits, season 3 episode guide,
  specs table, sources — all rendered from `metadata/episode-data.json`
- **Set design** — the reunion's purple diamond lattice wall, gold sofas and magenta stage wash rebuilt in CSS
- **Responsive** — three breakpoints, from ultrawide down to a phone; honors `prefers-reduced-motion`

### HTTP API

| Endpoint | Returns |
| --- | --- |
| `GET /` | The watch page |
| `GET /api/episode` | Episode + show + season + cast + crew + chapters + season guide (JSON) |
| `GET /api/video-info` | Whether a video was found, where, its size, and the player's target specs |
| `GET /media/<file>` | The video itself — `Accept-Ranges: bytes`, HTTP 206, `?download=1` to force a download |
| `GET /healthz` | Liveness + whether media is currently available |
| `GET /docs/…` `GET /metadata/…` `GET /assets/…` | Read-only static mounts |

Range requests are fully supported (`bytes=0-1023`, `bytes=1500000-`, `bytes=-512`), which is what makes
scrubbing, resuming and Safari playback work off a single progressive MP4.

---

## Directory structure

```
├── README.md
├── YouTube.mp4                ← the episode (not committed; see above)
├── package.json               npm start / check / info / convert
├── .gitignore
├── public/                    the watch page (served at /)
│   ├── index.html
│   ├── styles.css             purple diamond wall + gold sofa palette
│   ├── app.js                 player + metadata rendering (no dependencies)
│   └── assets/
│       ├── img/favicon.svg
│       ├── posters/reunion-part-2-poster.jpg
│       └── thumbnails/reunion-part-2-16x9.jpg
├── server/
│   ├── server.js              static + streaming server (Node built-ins only)
│   └── check.js               repo readiness check
├── docs/
│   ├── episode-guide.md       run of show, threads, production credits
│   └── cast-info.md           host, cast, guests, crew
├── metadata/
│   ├── episode-data.json      single source of truth for everything on the page
│   └── timestamps.json        chapter markers + runtime
├── scripts/
│   ├── video-converter.sh     remux / re-encode / web profile
│   └── metadata-parser.py     container inspector (no ffmpeg required)
└── assets/
    ├── thumbnails/            16:9 stills (1280×720, 640×360)
    └── posters/               poster art (1280×720)
```

---

## Media tooling

### Inspect a file

```bash
npm run info                    # python3 scripts/metadata-parser.py YouTube.mp4
python3 scripts/metadata-parser.py --json --pretty YouTube.mp4
python3 scripts/metadata-parser.py --dir .        # scan everything
python3 scripts/metadata-parser.py --self-test    # verify the parser against a synthetic MP4
```

The parser walks the ISO base-media boxes itself — duration, video/audio tracks, codec, profile/level,
resolution, frame rate, channel count, sample rate, average bitrate, plus whether the `moov` atom sits before
`mdat` (faststart, i.e. whether the file will start playing before it finishes downloading). It compares the
result against the target profile and tells you what to fix. MKV/AVI/WebM/TS fall back to `ffprobe` when
ffmpeg is installed.

### Convert a file

```bash
npm run convert                                     # → YouTube.m4v (remux, lossless)
./scripts/video-converter.sh in.mkv out.mp4 --copy   # remux only, instant
./scripts/video-converter.sh in.mp4 out.mp4 --web    # web profile: H.264 high, faststart, 1080p29.97
./scripts/video-converter.sh in.mp4 out.mp4 --crf 20 # quality-targeted encode
./scripts/video-converter.sh --inspect in.mp4        # ffprobe report
```

`--web` always writes `-movflags +faststart` so the file streams progressively, and tags the output with the
show/season/episode metadata.

### Check the repo

```bash
npm run check          # 25-point readiness check
npm run check -- --fix # create any missing folders
```

---

## Chapter markers

`metadata/timestamps.json` drives the chapter rail, the progress-bar ticks and the deep links.

> **Markers are a template, not verified timecodes.** The names follow the standard two-part reunion rundown;
> the start times are placeholders spread across the 42-minute runtime. Drop real timecodes in and every part
> of the page — rail, ticks, tooltips, `?t=` links — lines up automatically. The page shows a visible notice
> while the placeholders are still in place, and clears it as soon as `_placeholder` is removed.

```json
{ "id": "love-triangle", "title": "The Love Triangle", "start": 480, "end": 810, "tag": "Relationships" }
```

---

## Cast & crew

For the full breakdown see [`docs/cast-info.md`](docs/cast-info.md).

**Host:** Mona Scott-Young
**Cast:** Erica Mena · Yandy Smith-Harris · Tahiry Jose · Jen Bayer (Jen the Pen) · Raqi Thunda ·
Winter Ramos · Rashidah Ali
**Guests:** Joe Budden · Rich Dollaz · Consequence · Olivia Longott · Kaylin Garcia · Jewel Escobar ·
Funkmaster Flex · Tiffany Lewis · Lore'l · Lisa Ribacoff (certified polygraph examiner) ·
Mendeecees Harris (archive footage)
**Executive producers:** Mona Scott-Young (Monami Entertainment), Toby Barraud & Stefan Springman (NFGTV) ·
Shelly Tatro, Brad Abramson, Danielle Gelfand, Jeff Olde (VH1)

---

## Episode guide

[`docs/episode-guide.md`](docs/episode-guide.md) has the run of show, the season-long storylines carried into
part 2, and production credits. The season 3 episode list (14 episodes, January 7 – April 15, 2013) is
rendered on the page from `metadata/episode-data.json`.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes (`npm run check` before you push)
4. Submit a pull request

Data changes belong in `metadata/*.json` — the page reads them at runtime, so no rebuild is ever required.
Keep video files out of commits.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Page loads but the player shows the locker | `YouTube.mp4` isn't in the repo root — drop it in, or use drag-and-drop / `VIDEO_URL` |
| Player says the browser can't decode the file | Re-export as MP4 (H.264 + AAC): `./scripts/video-converter.sh in.mkv YouTube.mp4 --web` |
| Playback takes forever to start | The file isn't faststart: `./scripts/video-converter.sh in.mp4 out.mp4 --copy` rewrites it with the `moov` atom first |
| Seeking jumps back to the start | Your server isn't honoring range requests. Use `npm start`, which does |
| Port 3000 is taken | `PORT=8080 npm start` (the server also auto-increments if the port is busy) |
| Metadata changes don't show up | The JSON is fetched fresh each load — hard-reload the page; check `/api/episode` responds |

---

## License & rights

This repository is for informational and archival purposes only. **Love & Hip Hop**, **Love & Hip Hop: New
York**, and all related marks, footage, artwork and episode content are the property of VH1 / Paramount and
their respective owners. No rights are granted or implied. Video files are not distributed with this
repository. Episode metadata is compiled from the public sources listed in
[`metadata/episode-data.json`](metadata/episode-data.json).

The code in `public/`, `server/` and `scripts/` is provided as-is for use with content you are entitled to
handle.

## Contact

For questions or suggestions, please open an issue.

---

**Last Updated:** 2026-10-02
