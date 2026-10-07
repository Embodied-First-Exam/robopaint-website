#!/usr/bin/env python3
"""Encode the captured frames (scripts/capture_reference.py) into the site's timelapses.

usage: encode_timelapses.py <capture dir> [ids...]

For every <capture dir>/<id>/ with frames/ and capture.json: assets/media/works/<id>/timelapse.mp4 (H.264, 768 px, 24 fps,
a keyframe every 8 frames so the viewer's scrubber seeks fast, the finished sheet held for 1.5 s) and timelapse.json (per
frame the stroke number and the loaded paint, the strokes in all, the paints)."""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CAP = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[1]
ids = sys.argv[2:] or sorted(p.name for p in CAP.iterdir() if (p / "capture.json").exists())


def one(wid):
    src = CAP / wid
    cap = json.loads((src / "capture.json").read_text())
    out = ROOT / "assets" / "media" / "works" / wid
    out.mkdir(parents=True, exist_ok=True)
    n = len(cap["frames"])
    subprocess.run(["nice", "-n", "10", "ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", str(src / "frames" / "%05d.png"),
                    "-vf", "tpad=stop_mode=clone:stop_duration=1.5,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "22",
                    "-g", "8", "-keyint_min", "8", "-sc_threshold", "0", "-movflags", "+faststart", "-an", "-threads", "3",
                    str(out / "timelapse.mp4")], check=True)
    meta = {"fps": 24, "frames": n, "hold_s": 1.5, "strokes": max(f["stroke"] for f in cap["frames"]),
            "stroke": [f["stroke"] for f in cap["frames"]], "paint": [f["paint"] for f in cap["frames"]],
            "paints": [w["hex"] for w in cap["wells"]], "path_mm": cap["path_mm"], "steps": cap["steps"]}
    (out / "timelapse.json").write_text(json.dumps(meta, separators=(",", ":")))
    return wid, n, (out / "timelapse.mp4").stat().st_size


with ThreadPoolExecutor(4) as ex:
    tot = 0
    for wid, n, size in ex.map(one, ids):
        tot += size
        print(f"{wid:28s} {n:4d} frames {size / 1e6:6.2f} MB", flush=True)
print(f"total {tot / 1e6:.1f} MB")
