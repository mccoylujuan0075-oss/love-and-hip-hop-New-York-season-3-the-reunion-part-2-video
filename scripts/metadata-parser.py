#!/usr/bin/env python3
"""
metadata-parser.py — container metadata for Love & Hip Hop: New York S3E14.

Reads an MP4/M4V/MOV (ISO base media file format) directly — no ffmpeg, no
third-party packages — and reports duration, video/audio tracks, codec,
resolution, frame rate, bitrate and whether the file is laid out for
progressive streaming (moov atom before mdat / faststart).

MKV, AVI, WebM, MPEG-TS and anything else are handed to ffprobe when it is
installed. Without ffprobe you still get a size + container sniff report.

USAGE
    python3 scripts/metadata-parser.py YouTube.mp4
    python3 scripts/metadata-parser.py YouTube.mp4 --json
    python3 scripts/metadata-parser.py YouTube.mp4 --json --pretty
    python3 scripts/metadata-parser.py --dir .          # scan a folder
    python3 scripts/metadata-parser.py --self-test      # build+parse a fake file

Expected profile for this repo: 1920x1080, 29.97 fps, H.264, AAC 128 kbps.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path

VERSION = "1.0.0"
PRIMARY_NAME = "YouTube.mp4"
CONTAINER_EXT = {".mp4", ".m4v", ".mov", ".mkv", ".avi", ".webm", ".ts", ".flv", ".wmv"}
ISO_EXT = {".mp4", ".m4v", ".mov"}
TARGET = {
    "width": 1920,
    "height": 1080,
    "frameRate": 29.97,
    "videoCodec": "H.264 (AVC)",
    "audioCodec": "AAC",
    "audioBitrateKbps": 128,
}

# ── colours (disabled when not a TTY / NO_COLOR set) ──────────────────────
_TTY = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
def _c(code: str) -> str:
    return code if _TTY else ""
BOLD, DIM, GOLD, GREEN, YELLOW, RED, OFF = (
    _c("\033[1m"), _c("\033[2m"), _c("\033[33m"), _c("\033[32m"),
    _c("\033[93m"), _c("\033[31m"), _c("\033[0m"),
)

BOX_NAMES = {
    b"ftyp": "File type", b"moov": "Movie (metadata)", b"mdat": "Media data",
    b"free": "Free space", b"skip": "Free space", b"wide": "Wide box",
    b"moof": "Movie fragment", b"styp": "Segment type", b"sidx": "Segment index",
    b"uuid": "UUID box",
}
HANDLERS = {b"vide": "video", b"soun": "audio", b"subt": "subtitle", b"text": "text", b"sbtl": "subtitle", b"meta": "metadata"}
AVC_PROFILES = {66: "Baseline", 77: "Main", 88: "Extended", 100: "High", 110: "High 10", 122: "High 4:2:2", 144: "High 4:4:4"}
AVC_LEVELS = {10: "1.0", 11: "1.1", 12: "1.2", 13: "1.3", 20: "2.0", 21: "2.1", 22: "2.2", 30: "3.0", 31: "3.1",
              32: "3.2", 40: "4.0", 41: "4.1", 42: "4.2", 50: "5.0", 51: "5.1", 52: "5.2", 60: "6.0", 61: "6.1"}
AUDIO_NAMES = {b"mp4a": "AAC", b"alac": "Apple Lossless", b"ac-3": "AC-3", b"ec-3": "E-AC-3",
               b"Opus": "Opus", b"twos": "PCM (BE)", b"sowt": "PCM (LE)", b"lpcm": "PCM"}
VIDEO_NAMES = {b"avc1": "H.264 (AVC)", b"avc3": "H.264 (AVC)", b"hvc1": "H.265 (HEVC)", b"hev1": "H.265 (HEVC)",
               b"vp09": "VP9", b"av01": "AV1", b"mp4v": "MPEG-4 Visual", b"jpeg": "Motion JPEG"}


# ── ISO BMFF box walking ─────────────────────────────────────────────────

@dataclass
class Track:
    kind: str = "unknown"           # video | audio | subtitle | …
    codec: str | None = None
    width: int | None = None
    height: int | None = None
    frame_rate: float | None = None
    duration: float | None = None
    timescale: int | None = None
    channels: int | None = None
    sample_rate: int | None = None
    language: str | None = None
    profile: str | None = None
    level: str | None = None

@dataclass
class Report:
    file: str = ""
    exists: bool = False
    size_bytes: int = 0
    size_human: str = ""
    container: str = "unknown"
    parser: str = "builtin-iso"
    brand: str | None = None
    duration_seconds: float | None = None
    duration_label: str | None = None
    bitrate_kbps: float | None = None
    tracks: list = field(default_factory=list)
    first_boxes: list = field(default_factory=list)
    moov_before_mdat: bool | None = None
    faststart: bool | None = None
    compatible_with_target: bool | None = None
    notes: list = field(default_factory=list)
    errors: list = field(default_factory=list)


def human_bytes(n: int) -> str:
    v = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if v < 1024 or unit == "TB":
            return f"{v:.0f} {unit}" if unit == "B" else f"{v:.1f} {unit}"
        v /= 1024
    return f"{v:.1f} TB"


def fmt_time(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _read(fh, offset: int, length: int) -> bytes:
    fh.seek(offset)
    return fh.read(length)


def _u32(b: bytes, o: int = 0) -> int:
    return struct.unpack_from(">I", b, o)[0]


def iter_boxes(fh, start: int, end: int, depth: int = 0):
    """Yield (type, box_start, payload_start, payload_end, header_size).

    Stops cleanly at truncation / nonsense so a corrupt or partially
    downloaded file still produces a useful report.
    """
    pos = start
    while pos + 8 <= end:
        header = _read(fh, pos, 8)
        if len(header) < 8:
            return
        size = _u32(header, 0)
        btype = header[4:8]
        header_size = 8
        if size == 1:                      # 64-bit size
            large = _read(fh, pos + 8, 8)
            if len(large) < 8:
                return
            size = struct.unpack(">Q", large)[0]
            header_size = 16
        elif size == 0:                    # extends to EOF
            size = end - pos
        if size < header_size or pos + size > end:
            size = end - pos               # tolerate truncation
        if size <= 0:
            return
        yield btype, pos, pos + header_size, pos + size, header_size
        pos += size


def _find(fh, start: int, end: int, path: list[bytes], depth: int = 0):
    """Descend a box path, e.g. [b'moov', b'trak', b'mdia', b'mdhd']."""
    if depth >= len(path):
        return (start, end)
    for btype, bstart, pstart, pend, _h in iter_boxes(fh, start, end, depth):
        if btype == path[depth]:
            if depth == len(path) - 1:
                return (pstart, pend)
            found = _find(fh, pstart, pend, path, depth + 1)
            if found:
                return found
    return None


def _fourcc(b: bytes) -> str:
    return b.decode("latin-1").strip()


def parse_iso(fh, rep: Report) -> None:
    """Parse moov/trak metadata out of an ISO base media file."""
    fh.seek(0, os.SEEK_END)
    filesize = fh.tell()

    # top level boxes (cap the scan so a 4 GB file is still instant)
    top = []
    for btype, bstart, pstart, pend, _h in iter_boxes(fh, 0, filesize):
        top.append((btype, pstart, pend))
        if len(top) > 32:
            break

    rep.first_boxes = [BOX_NAMES.get(t, _fourcc(t)) for t, _s, _e in top[:6]]
    order = [t for t, _s, _e in top]
    if b"moov" in order and b"mdat" in order:
        rep.moov_before_mdat = order.index(b"moov") < order.index(b"mdat")
        rep.faststart = rep.moov_before_mdat
        if not rep.faststart:
            rep.notes.append("moov atom sits after mdat — remux with -movflags +faststart for instant web playback")

    # ftyp
    ftyp = next((b for b in top if b[0] == b"ftyp"), None)
    if ftyp:
        data = _read(fh, ftyp[1], min(24, ftyp[2] - ftyp[1]))
        if len(data) >= 8:
            major = _fourcc(data[0:4])
            brands = [_fourcc(data[i:i + 4]) for i in range(8, len(data) - 3, 4)]
            rep.brand = major
            rep.container = "MP4" if "isom" in brands + [major] else (major.upper() or "unknown")
            rep.notes.append(f"brands: {major}, {', '.join(b for b in brands if b.strip())}")

    # moov -> mvhd (movie duration)
    mvhd = _find(fh, 0, filesize, [b"moov", b"mvhd"])
    if mvhd:
        s, e = mvhd
        data = _read(fh, s, min(32, e - s))
        version = data[0] if data else 0
        if version == 1:
            timescale = _u32(data, 20)
            duration = struct.unpack_from(">Q", data, 24)[0] if len(data) >= 32 else 0
        else:
            timescale = _u32(data, 12)
            duration = _u32(data, 16)
        if timescale:
            rep.duration_seconds = duration / timescale
            rep.duration_label = fmt_time(rep.duration_seconds)
    else:
        rep.errors.append("no mvhd box found (file may be truncated or not an ISO media file)")

    # tracks
    for btype, bstart, pstart, pend, _h in iter_boxes(fh, _first_moov(fh, filesize), _moov_end(fh, filesize), 0):
        if btype != b"trak":
            continue
        tr = Track()
        hdlr = _find(fh, pstart, pend, [b"mdia", b"hdlr"])
        if hdlr:
            data = _read(fh, hdlr[0] + 8, 4)
            if len(data) == 4:
                tr.kind = HANDLERS.get(data, _fourcc(data) or "unknown")
        mdhd = _find(fh, pstart, pend, [b"mdia", b"mdhd"])
        if mdhd:
            data = _read(fh, mdhd[0], 32)
            if data:
                if data[0] == 1:
                    tr.timescale = _u32(data, 20)
                    tr.duration = struct.unpack_from(">Q", data, 24)[0] / tr.timescale if tr.timescale else None
                else:
                    tr.timescale = _u32(data, 12)
                    dur = _u32(data, 16)
                    tr.duration = dur / tr.timescale if tr.timescale else None
        tkhd = _find(fh, pstart, pend, [b"tkhd"])
        if tkhd:
            data = _read(fh, tkhd[0], 96)
            # 16.16 fixed-point display size: at 76/80 in version 0, at 88/92 in version 1
            wh_off = 88 if (data[:1] == b"\x01") else 76
            if len(data) >= wh_off + 8:
                w = struct.unpack_from(">I", data, wh_off)[0] / 65536.0
                h = struct.unpack_from(">I", data, wh_off + 4)[0] / 65536.0
                if w and h:
                    tr.width, tr.height = int(round(w)), int(round(h))
        stsd = _find(fh, pstart, pend, [b"mdia", b"minf", b"stbl", b"stsd"])
        if stsd:
            s, e = stsd
            data = _read(fh, s, min(8, e - s))
            if len(data) >= 8:
                # stsd payload: version/flags(4) + entry_count(4), then entries as boxes.
                # Each entry's own box header carries the codec fourcc.
                entry_start = s + 8                      # entry box header
                entry_payload = entry_start + 8          # entry body
                entry_fourcc = _read(fh, entry_start + 4, 4)
                if tr.kind == "video":
                    tr.codec = VIDEO_NAMES.get(entry_fourcc, _fourcc(entry_fourcc))
                    # VisualSampleEntry: reserved(6)+dri(2)+pre(2)+res(2)+pre(12) → width@24, height@26
                    box = _read(fh, entry_payload, min(28, e - entry_payload))
                    if len(box) >= 28:
                        w = struct.unpack_from(">H", box, 24)[0]
                        h = struct.unpack_from(">H", box, 26)[0]
                        if w and h:
                            tr.width, tr.height = w, h
                    # avcC -> profile / level
                    for bt, bs, ps, pe, _h2 in iter_boxes(fh, entry_payload, e):
                        if bt == b"avcC":
                            cfg = _read(fh, ps, min(4, pe - ps))
                            if len(cfg) >= 4:
                                tr.profile = AVC_PROFILES.get(cfg[1], f"profile {cfg[1]}")
                                tr.level = AVC_LEVELS.get(cfg[3], f"level {cfg[3]}")
                    stts = _find(fh, pstart, pend, [b"mdia", b"minf", b"stbl", b"stts"])
                    if stts and tr.duration:
                        d = _read(fh, stts[0], 16)
                        if len(d) >= 16:
                            count = _u32(d, 4)
                            if count >= 1:
                                sample_count, delta = _u32(d, 8), _u32(d, 12)
                                if delta and tr.timescale and sample_count:
                                    tr.frame_rate = tr.timescale / delta
                elif tr.kind == "audio":
                    tr.codec = AUDIO_NAMES.get(entry_fourcc, _fourcc(entry_fourcc))
            # audio channel count / sample rate live in the AudioSampleEntry
            if tr.kind == "audio":
                box = _read(fh, entry_payload, min(28, e - entry_payload))
                if len(box) >= 28:
                    tr.channels = struct.unpack_from(">H", box, 16)[0]
                    tr.sample_rate = _u32(box, 24) >> 16
        tr.duration = round(tr.duration, 3) if tr.duration else None
        if tr.frame_rate:
            tr.frame_rate = round(tr.frame_rate, 3)
        rep.tracks.append(tr)

    if rep.duration_seconds:
        rep.bitrate_kbps = round(rep.size_bytes * 8 / rep.duration_seconds / 1000, 1)


def _first_moov(fh, filesize: int) -> int:
    for btype, _s, pstart, _e, _h in iter_boxes(fh, 0, filesize):
        if btype == b"moov":
            return pstart
    return 0


def _moov_end(fh, filesize: int) -> int:
    for btype, _s, _p, pend, _h in iter_boxes(fh, 0, filesize):
        if btype == b"moov":
            return pend
    return 0


# ── ffprobe fallback ─────────────────────────────────────────────────────

def parse_ffprobe(path: Path, rep: Report) -> bool:
    """Use ffprobe for containers we can't read natively (MKV/AVI/WebM/TS)."""
    exe = shutil.which("ffprobe")
    if not exe:
        rep.notes.append("ffprobe not installed — install ffmpeg for full probing of this container")
        return False
    cmd = [exe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=60, check=False)
        if out.returncode != 0:
            rep.errors.append(f"ffprobe exited {out.returncode}: {out.stderr.decode('utf-8', 'ignore').strip()[:200]}")
            return False
        data = json.loads(out.stdout.decode("utf-8", "ignore") or "{}")
    except Exception as exc:  # noqa: BLE001
        rep.errors.append(f"ffprobe failed: {exc}")
        return False

    rep.parser = "ffprobe"
    fmt = data.get("format", {})
    if fmt.get("duration"):
        rep.duration_seconds = float(fmt["duration"])
        rep.duration_label = fmt_time(rep.duration_seconds)
    if fmt.get("format_name"):
        rep.container = fmt["format_name"].split(",")[0].upper()
    if fmt.get("bit_rate"):
        rep.bitrate_kbps = round(int(fmt["bit_rate"]) / 1000, 1)

    for st in data.get("streams", []):
        tr = Track(kind=st.get("codec_type", "unknown"))
        tr.codec = (st.get("codec_long_name") or st.get("codec_name") or "").split(" (")[0]
        tr.width = st.get("width")
        tr.height = st.get("height")
        if st.get("avg_frame_rate") and st["avg_frame_rate"] not in ("0/0", "N/A"):
            num, _, den = st["avg_frame_rate"].partition("/")
            try:
                tr.frame_rate = round(float(num) / float(den or 1), 3)
            except (ValueError, ZeroDivisionError):
                pass
        tr.channels = st.get("channels")
        tr.sample_rate = int(st["sample_rate"]) if st.get("sample_rate", "").isdigit() else None
        if st.get("duration"):
            tr.duration = round(float(st["duration"]), 3)
        if st.get("profile"):
            tr.profile = st["profile"]
        rep.tracks.append(tr)
    return True


def sniff(path: Path) -> str:
    """Container sniff by magic bytes (works even with no parser available)."""
    head = path.open("rb").read(16)
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return "MP4/MOV (ISO BMFF)"
    if head[:4] == b"\x1aE\xdf\xa3":
        return "Matroska / WebM"
    if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
        return "AVI (RIFF)"
    if head[:3] == b"\x47\x40\x11" or head[:1] == b"\x47":
        return "MPEG-TS"
    return "unknown"


# ── analysis ─────────────────────────────────────────────────────────────

def analyse(path: Path, want_json: bool) -> Report:
    rep = Report(file=str(path))
    rep.exists = path.is_file()
    if not rep.exists:
        rep.errors.append(f"file not found: {path}")
        return rep

    rep.size_bytes = path.stat().st_size
    rep.size_human = human_bytes(rep.size_bytes)
    if rep.size_bytes == 0:
        rep.errors.append("file is empty (0 bytes)")
        return rep

    ext = path.suffix.lower()
    magic = sniff(path)
    rep.parser = "builtin-iso" if ext in ISO_EXT else "sniff"

    if ext in ISO_EXT or "MP4" in magic:
        with path.open("rb") as fh:
            parse_iso(fh, rep)
            if not rep.duration_seconds and not rep.tracks:
                rep.parser = "builtin-iso (partial)"
                if not parse_ffprobe(path, rep):
                    rep.container = rep.container if rep.container != "unknown" else magic
    else:
        rep.container = magic
        parse_ffprobe(path, rep)

    if not rep.container or rep.container == "unknown":
        rep.container = magic

    # Compare against the profile this repo targets.
    v = next((t for t in rep.tracks if t.kind == "video"), None)
    a = next((t for t in rep.tracks if t.kind == "audio"), None)
    if v:
        ok = True
        if v.width and v.height and (v.width, v.height) != (TARGET["width"], TARGET["height"]):
            ok = False
            rep.notes.append(f"resolution {v.width}x{v.height} differs from target {TARGET['width']}x{TARGET['height']} (fine — the player letterboxes)")
        if v.codec and "H.264" not in str(v.codec) and "AVC" not in str(v.codec):
            ok = False
            rep.notes.append(f"video codec is {v.codec} — browsers play H.264 MP4 most reliably; re-encode with scripts/video-converter.sh")
        if v.frame_rate and abs(v.frame_rate - TARGET["frameRate"]) > 0.6:
            rep.notes.append(f"frame rate {v.frame_rate} fps differs from the 29.97 fps profile")
        rep.compatible_with_target = ok
    if a and a.codec and "AAC" not in str(a.codec).upper() and "MP3" not in str(a.codec).upper():
        rep.notes.append(f"audio codec is {a.codec} — AAC is the safest for browsers")
        rep.compatible_with_target = False
    if not v:
        rep.notes.append("no video track found in the first pass")
    return rep


def print_report(rep: Report) -> None:
    print()
    print(f"{BOLD}{GOLD}Love & Hip Hop: New York · S3 E14 · Reunion: Part 2{OFF}")
    print(f"{DIM}container metadata report — metadata-parser.py v{VERSION}{OFF}")
    print("─" * 68)
    print(f"  file          {rep.file}")
    if not rep.exists:
        print(f"  {RED}✗ {rep.errors[0]}{OFF}")
        print()
        print(f"  {DIM}Expected {PRIMARY_NAME} in the repository root (or assets/videos/).{OFF}")
        print()
        return
    print(f"  size          {rep.size_human} ({rep.size_bytes:,} bytes)")
    print(f"  container     {rep.container}" + (f"  ·  brand {rep.brand}" if rep.brand else ""))
    print(f"  parsed by     {rep.parser}")
    if rep.duration_label:
        print(f"  duration      {rep.duration_label}  ({rep.duration_seconds:.2f}s)")
    if rep.bitrate_kbps:
        print(f"  bitrate       {rep.bitrate_kbps:,.0f} kbps average")
    if rep.faststart is not None:
        flag = f"{GREEN}yes{OFF}" if rep.faststart else f"{YELLOW}no{OFF}"
        print(f"  faststart     {flag}{DIM}  (moov before mdat){OFF}")

    if rep.tracks:
        print()
        print(f"  {BOLD}tracks{OFF}")
        for i, t in enumerate(rep.tracks):
            label = t.kind
            head = f"    [{i}] {label:<9}"
            detail = []
            if t.codec:
                detail.append(str(t.codec))
            if t.profile:
                detail.append(f"{t.profile}{' @ ' + str(t.level) if t.level else ''}")
            if t.width and t.height:
                detail.append(f"{t.width}x{t.height}")
            if t.frame_rate:
                detail.append(f"{t.frame_rate:g} fps")
            if t.channels:
                detail.append(f"{t.channels}ch")
            if t.sample_rate:
                detail.append(f"{t.sample_rate} Hz")
            if t.duration:
                detail.append(fmt_time(t.duration))
            print(head + " · ".join(detail))

    if rep.notes:
        print()
        for n in rep.notes:
            print(f"  {DIM}· {n}{OFF}")
    if rep.errors:
        print()
        for e in rep.errors:
            print(f"  {RED}✗ {e}{OFF}")

    print()
    if rep.compatible_with_target is True:
        print(f"  {GREEN}✓ Matches the repo's target profile{OFF} — the watch page will stream it as-is.")
    elif rep.compatible_with_target is False:
        print(f"  {YELLOW}! Playable, but not an exact match for the target profile{OFF} — see notes above.")
    print(f"  {DIM}Serve it: npm start   ·   deeper probe: ffprobe -show_streams \"{Path(rep.file).name}\"{OFF}")
    print()


def scan_dir(folder: Path) -> list[Path]:
    found = []
    for p in sorted(folder.rglob("*")):
        if p.is_file() and p.suffix.lower() in CONTAINER_EXT and p.stat().st_size > 0:
            found.append(p)
    return found


def self_test() -> int:
    """Build a minimal but valid ISO BMFF file in a temp dir and parse it back."""
    import tempfile

    def box(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload) + 8) + kind + payload

    VF = b"\x00\x00\x00\x00"                     # version(0) + flags(3)

    ftyp = box(b"ftyp", b"isom" + struct.pack(">I", 512) + b"isomiso2avc1mp41")

    # tkhd v0: vf(4) creation(4) modification(4) track_ID(4) reserved(4) duration(4)
    #          reserved2(8) layer(2) alt(2) volume(2) reserved(2) matrix(36) width(4) height(4)
    tkhd = box(b"tkhd",
               VF + struct.pack(">II", 0, 0) + struct.pack(">I", 1) + b"\x00" * 4 +
               struct.pack(">I", 2520000) + b"\x00" * 8 + struct.pack(">HH", 0, 0) +
               struct.pack(">HH", 0, 0) + b"\x00" * 36 +
               struct.pack(">II", 1920 << 16, 1080 << 16))

    # mdhd v0: vf(4) creation(4) modification(4) timescale(4) duration(4) language(2) pre(2)
    mdhd_video = box(b"mdhd", VF + struct.pack(">II", 0, 0) + struct.pack(">II", 30000, 30000 * 42) + b"\x00" * 4)
    hdlr_video = box(b"hdlr", b"\x00" * 8 + b"vide" + b"\x00" * 12)

    avcC = box(b"avcC", b"\x01\x64\x00\x29\xff")           # profile 100 (High), level 41 (4.1)
    # VisualSampleEntry: 24 bytes of fixed fields, then width(2) height(2), pad to 76, then avcC
    avc1 = box(b"avc1", b"\x00" * 24 + struct.pack(">HH", 1920, 1080) + b"\x00" * 48 + avcC)
    stsd = box(b"stsd", VF + struct.pack(">I", 1) + avc1)
    stts = box(b"stts", VF + struct.pack(">III", 1, 1258800, 1001))   # 30000/1001 = 29.97 fps
    stbl = box(b"stbl", stsd + stts)
    mdia = box(b"mdia", mdhd_video + hdlr_video + box(b"minf", box(b"stbl", b"") + stbl))
    trak = box(b"trak", tkhd + mdia)

    # mvhd v0: vf(4) creation(4) modification(4) timescale(4) duration(4) …
    mvhd = box(b"mvhd", VF + struct.pack(">II", 0, 0) + struct.pack(">II", 1000, 2520000) + b"\x00" * 80)
    moov = box(b"moov", mvhd + trak)
    data = ftyp + moov + box(b"mdat", b"\x00" * 4096)

    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "self-test.mp4"
        p.write_bytes(data)
        rep = analyse(p, False)
        print_report(rep)
        ok = bool(rep.duration_seconds and rep.tracks and rep.faststart)
        print(f"{GREEN}✓ self-test passed{OFF} — parsed duration, tracks and faststart from a synthetic MP4"
              if ok else f"{RED}✗ self-test failed{OFF}")
        print()
        return 0 if ok else 1


# ── cli ──────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        prog="metadata-parser.py",
        description="Container metadata for Love & Hip Hop: New York S3E14 (Reunion: Part 2).",
        epilog="Expected profile: 1920x1080 · 29.97 fps · H.264 · AAC 128 kbps.",
    )
    ap.add_argument("video", nargs="?", help=f"video file to inspect (default: {PRIMARY_NAME} in the repo root)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a formatted report")
    ap.add_argument("--pretty", action="store_true", help="pretty-print the JSON output")
    ap.add_argument("--dir", metavar="FOLDER", help="scan a folder for every supported video file")
    ap.add_argument("--self-test", action="store_true", help="verify the parser against a synthetic MP4")
    ap.add_argument("--version", action="version", version=f"metadata-parser.py {VERSION}")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    root = Path(__file__).resolve().parent.parent

    if args.dir:
        folder = Path(args.dir)
        if not folder.is_dir():
            print(f"{RED}✗ not a folder: {folder}{OFF}")
            return 2
        videos = scan_dir(folder)
        if not videos:
            print(f"{YELLOW}! no video files under {folder}{OFF}")
            return 1
        reports = [analyse(v, args.json) for v in videos]
    else:
        target = Path(args.video) if args.video else (root / PRIMARY_NAME)
        if not target.is_absolute() and not target.exists() and (root / target).exists():
            target = root / target
        reports = [analyse(target, args.json)]

    if args.json:
        payload = [asdict(r) for r in reports] if len(reports) > 1 else asdict(reports[0])
        print(json.dumps(payload, indent=2 if args.pretty else None))
    else:
        for r in reports:
            print_report(r)

    return 0 if all(r.exists and not r.errors for r in reports) else 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        print("\ninterrupted")
        sys.exit(130)
