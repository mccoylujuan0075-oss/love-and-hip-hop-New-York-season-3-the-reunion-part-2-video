# Love & Hip Hop New York - Season 3: The Reunion Part 2

All new Love and Hip Hop: The Reunion Part 2 Mon + 8/7C on VH1

## Overview

This repository contains information, resources, and metadata for Love & Hip Hop New York Season 3:
The Reunion Part 2 episode (S3:E14, series #34, aired Monday **April 15, 2013**, 2.35 M viewers) —
plus a **fan-made 15-second sneak-peek promo reel** built entirely from the assets in this repo.

## Episode Details

- **Show:** Love & Hip Hop New York
- **Season:** 3
- **Special:** The Reunion Part 2 (episode 14 of 14)
- **Air Date:** Monday, April 15, 2013
- **Time:** 8/7C
- **Network:** VH1
- **Reunion host:** Mona Scott-Young · **DJ:** Funkmaster Flex
- **Runtime / rating:** ~42 min · TV-14

## The promo video (MP4)

`love-and-hip-hop-new-york-season-3-the-reunion-part-2.mp4` (repo root) is a 15.015 s
sneak-peek style promo: title card → two Ken Burns "sneak peek" moves over the remastered
roundtable still → broadcast end card, with a synthesized audio pad.

| Property | Value |
|----------|-------|
| Container | MP4 (isom / faststart) |
| Resolution | 1920×1080 (Full HD, 16:9) |
| Frame rate | 30000/1001 (29.97 fps), 450 frames |
| Video codec | H.264 (libx264, High profile, CRF 20) |
| Audio | AAC LC, 128 kbps, 48 kHz stereo |
| Chapters | 4 — see [`metadata/timestamps.json`](metadata/timestamps.json) |

Rebuild it any time (needs ImageMagick + ffmpeg):

```bash
./scripts/build-promo-video.sh
```

## Video Information

### Supported Formats
- MP4
- M4V
- MKV
- AVI
- MOV

### Video Specifications
- **Resolution:** 1080p (Full HD)
- **Frame Rate:** 29.97 fps
- **Codec:** H.264
- **Audio:** AAC, 128 kbps

## Directory Structure

```
├── README.md
├── love-and-hip-hop-new-york-season-3-the-reunion-part-2.mp4   ← the promo reel
├── screenshot16_9.jpg                                          ← original reunion-set still (300×169)
├── docs/
│   ├── episode-guide.md        season table, reunion rundown, promo chapter map
│   └── cast-info.md            cast, reunion guests, crew
├── metadata/
│   ├── episode-data.json       structured episode/season/video metadata
│   └── timestamps.json         chapter map of the promo reel (frames + timecodes)
├── scripts/
│   ├── build-promo-video.sh    rebuilds the MP4, thumbnails and posters from scratch
│   ├── video-converter.sh      converts between mp4/m4v/mkv/avi/mov at house specs
│   └── metadata-parser.py      dependency-free MP4/MKV/AVI metadata parser (JSON)
├── assets/
│   ├── source/                 remastered 16:9 plate used by the video build
│   ├── thumbnails/             4 frame-grab thumbnails (1280×720)
│   └── posters/                16:9 key art + 9:16 social poster
└── .gitignore
```

## Getting Started

1. Clone this repository
2. Review the documentation in `/docs`
3. Check episode metadata in `/metadata`
4. Use scripts in `/scripts` for video processing
5. Watch `love-and-hip-hop-new-york-season-3-the-reunion-part-2.mp4`

## Video Processing

### Converting Video Formats

Use the provided script to convert videos:

```bash
./scripts/video-converter.sh input-file.mp4 output-file.m4v
./scripts/video-converter.sh --info input-file.mp4
```

### Extracting Metadata

Parse video metadata (stdlib only — no ffprobe needed):

```bash
python3 scripts/metadata-parser.py video-file.mp4 --pretty
```

### Rebuilding the Promo

```bash
./scripts/build-promo-video.sh     # writes MP4 + assets/thumbnails/* + assets/posters/*
```

## Cast & Crew

For detailed cast information, see [cast-info.md](docs/cast-info.md)

## Episode Guide

Detailed breakdown and scene guide available in [episode-guide.md](docs/episode-guide.md)

## Contributing

To contribute to this project:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This repository is for informational purposes only; the promo reel is a fan-made transformation of
repository assets and contains no episode footage. All content rights belong to VH1, Monami
Entertainment, NFGTV and their respective owners.

## Contact

For questions or suggestions, please open an issue.

---

**Last Updated:** 2026-10-02
