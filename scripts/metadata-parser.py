#!/usr/bin/env python3
"""Print technical metadata for a video file as JSON, using ffprobe.

Usage:
    python scripts/metadata-parser.py video-file.mp4
    python scripts/metadata-parser.py video-file.mp4 --out metadata/video-file.json

Requires ffprobe (part of ffmpeg) on PATH. Uses only the Python standard library.
"""

import argparse
import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path


def run_ffprobe(path: Path) -> dict:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        sys.exit("error: ffprobe is not installed or not on PATH (install ffmpeg)")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"error: ffprobe failed: {exc.stderr.strip()}")
    return json.loads(result.stdout)


def parse_fps(value: str | None) -> float | None:
    if not value or value == "0/0":
        return None
    return round(float(Fraction(value)), 3)


def summarize(path: Path, probe: dict) -> dict:
    fmt = probe.get("format", {})
    streams = probe.get("streams", [])

    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    summary = {
        "file": path.name,
        "container": fmt.get("format_long_name"),
        "duration_seconds": round(float(fmt["duration"]), 2) if "duration" in fmt else None,
        "size_bytes": int(fmt["size"]) if "size" in fmt else None,
        "overall_bitrate_kbps": round(int(fmt["bit_rate"]) / 1000) if "bit_rate" in fmt else None,
        "video": None,
        "audio": None,
    }

    if video:
        summary["video"] = {
            "codec": video.get("codec_name"),
            "width": video.get("width"),
            "height": video.get("height"),
            "frame_rate": parse_fps(video.get("avg_frame_rate")),
            "pixel_format": video.get("pix_fmt"),
        }

    if audio:
        summary["audio"] = {
            "codec": audio.get("codec_name"),
            "channels": audio.get("channels"),
            "sample_rate_hz": int(audio["sample_rate"]) if "sample_rate" in audio else None,
            "bitrate_kbps": round(int(audio["bit_rate"]) / 1000) if "bit_rate" in audio else None,
        }

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Print video metadata as JSON.")
    parser.add_argument("video", type=Path, help="path to the video file")
    parser.add_argument("--out", type=Path, help="also write the JSON to this file")
    args = parser.parse_args()

    if not args.video.is_file():
        sys.exit(f"error: file not found: {args.video}")

    data = summarize(args.video, run_ffprobe(args.video))
    text = json.dumps(data, indent=2)
    print(text)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
