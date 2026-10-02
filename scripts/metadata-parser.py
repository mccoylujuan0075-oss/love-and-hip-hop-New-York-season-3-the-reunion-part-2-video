#!/usr/bin/env python3
"""metadata-parser.py — dependency-free video metadata parser.

Parses container-level metadata from MP4/M4V/MOV (ISO-BMFF boxes), MKV/WebM
(EBML) and AVI (RIFF) files using only the Python standard library, and prints
a JSON report: container, brand, duration, frame rate, resolution, codecs.

Usage:
    python3 scripts/metadata-parser.py video-file.mp4 [--pretty]
"""
from __future__ import annotations

import json
import struct
import sys


def _u32(b: bytes, o: int) -> int:
    return struct.unpack(">I", b[o:o + 4])[0]


def _u16(b: bytes, o: int) -> int:
    return struct.unpack(">H", b[o:o + 2])[0]


def parse_mp4(data: bytes) -> dict:
    """Walk ISO-BMFF boxes: ftyp, moov/mvhd, trak/{mdhd,hdlr,stsd,stts}."""
    out: dict = {"container": "mp4", "brands": [], "tracks": []}
    pos, n = 0, len(data)

    def boxes(buf: bytes, base: int, end: int):
        p = base
        while p + 8 <= end:
            size = _u32(buf, p)
            typ = buf[p + 4:p + 8].decode("latin1")
            hdr = 8
            if size == 1:
                size = struct.unpack(">Q", buf[p + 8:p + 16])[0]
                hdr = 16
            elif size == 0:
                size = end - p
            if size < hdr:
                break
            yield typ, p + hdr, p + size
            p += size

    duration = rate = None
    for typ, s, e in boxes(data, 0, n):
        if typ == "ftyp":
            out["brands"].append(data[s:s + 4].decode("latin1"))
        elif typ == "moov":
            for t2, s2, e2 in boxes(data, s, e):
                if t2 == "mvhd":
                    ver = data[s2]
                    if ver == 1:
                        ts, dur = _u32(data, s2 + 20), struct.unpack(">Q", data[s2 + 24:s2 + 32])[0]
                    else:
                        ts, dur = _u32(data, s2 + 12), _u32(data, s2 + 16)
                    if ts:
                        duration = dur / ts
                        out["duration_seconds"] = round(duration, 3)
                        out["movie_timescale"] = ts
                elif t2 == "trak":
                    track: dict = {}
                    for t3, s3, e3 in boxes(data, s2, e2):          # tkhd, edts, mdia...
                        if t3 == "tkhd" and e3 - s3 >= 88:
                            track["width"] = _u32(data, e3 - 8) >> 16
                            track["height"] = _u32(data, e3 - 4) >> 16
                        elif t3 == "mdia":
                            for t4, s4, e4 in boxes(data, s3, e3):  # mdhd, hdlr, minf
                                if t4 == "mdhd":
                                    ver = data[s4]
                                    if ver == 1:
                                        tts, tdur = _u32(data, s4 + 20), struct.unpack(">Q", data[s4 + 24:s4 + 32])[0]
                                    else:
                                        tts, tdur = _u32(data, s4 + 12), _u32(data, s4 + 16)
                                    track["timescale"] = tts
                                    if tts:
                                        track["duration_seconds"] = round(tdur / tts, 3)
                                elif t4 == "hdlr":
                                    track["handler"] = data[s4 + 8:s4 + 12].decode("latin1")
                                elif t4 == "minf":
                                    for t5, s5, e5 in boxes(data, s4, e4):
                                        if t5 == "stbl":
                                            for t6, s6, e6 in boxes(data, s5, e5):
                                                if t6 == "stsd":
                                                    entry = data[s6 + 12:s6 + 16].decode("latin1")
                                                    track["codec"] = entry
                                                    if entry in ("avc1", "avc3") and e6 - s6 >= 48:
                                                        track["width"] = _u16(data, s6 + 40)
                                                        track["height"] = _u16(data, s6 + 42)
                                                elif t6 == "stts" and e6 - s6 >= 16:
                                                    if _u32(data, s6 + 4):
                                                        track["sample_count"] = _u32(data, s6 + 8)
                                                        track["sample_delta"] = _u32(data, s6 + 12)
                    if (track.get("handler") == "vide" and track.get("timescale")
                            and track.get("sample_delta")):
                        track["frame_rate"] = round(track["timescale"] / track["sample_delta"], 3)
                    if track:
                        out["tracks"].append(track)
    if out["tracks"] and duration:
        vt = [t for t in out["tracks"] if t.get("handler") == "vide"]
        if vt and vt[0].get("frame_rate"):
            out["frame_rate"] = vt[0]["frame_rate"]
    return out


def parse_mkv(data: bytes) -> dict:
    """Minimal EBML scan: TimecodeScale (0x2AD7B1) + Duration (0x4489)."""
    out = {"container": "matroska", "tracks": []}
    ts, dur = 1_000_000, None
    i = data.find(b"\x2a\xd7\xb1")
    if i != -1:
        ln = data[i + 3] & 0x7F
        ts = int.from_bytes(data[i + 4:i + 4 + ln], "big")
    i = data.find(b"\x44\x89")
    if i != -1:
        ln = data[i + 2] & 0x7F
        raw = data[i + 3:i + 3 + ln]
        if ln == 8:
            dur = struct.unpack(">d", raw)[0]
        elif ln == 4:
            dur = struct.unpack(">f", raw)[0]
    if dur is not None:
        out["duration_seconds"] = round(dur * ts / 1e9, 3)
    out["note"] = "light EBML scan (stdlib only)"
    return out


def parse_avi(data: bytes) -> dict:
    """RIFF AVI: read avih main header."""
    out = {"container": "avi", "tracks": []}
    i = data.find(b"avih")
    if i != -1:
        us_per_frame = struct.unpack("<I", data[i + 4:i + 8])[0]
        out["width"] = struct.unpack("<I", data[i + 36:i + 40])[0]
        out["height"] = struct.unpack("<I", data[i + 40:i + 44])[0]
        out["total_frames"] = struct.unpack("<I", data[i + 20:i + 24])[0]
        if us_per_frame:
            out["frame_rate"] = round(1_000_000 / us_per_frame, 3)
            if out["total_frames"]:
                out["duration_seconds"] = round(out["total_frames"] * us_per_frame / 1e6, 3)
    return out


def parse(path: str) -> dict:
    with open(path, "rb") as fh:
        data = fh.read()
    info = {"file": path, "size_bytes": len(data)}
    if data[4:8] == b"ftyp" or data[4:12] in (b"moov", b"wide", b"free"):
        info.update(parse_mp4(data))
    elif data[:4] == b"\x1a\x45\xdf\xa3":
        info.update(parse_mkv(data))
    elif data[:4] == b"RIFF" and data[8:12] == b"AVI ":
        info.update(parse_avi(data))
    else:
        info.update({"container": "unknown"})
    return info


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if a != "--pretty"]
    pretty = "--pretty" in argv
    if not args:
        print(__doc__)
        return 2
    info = parse(args[0])
    print(json.dumps(info, indent=2 if pretty else None, sort_keys=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
