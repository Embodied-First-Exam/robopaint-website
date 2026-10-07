#!/usr/bin/env python3
"""The agents' copies for the site: the sheet each attempt ended with, from the public replays of the batch evaluation.

usage: export_attempts.py <run media base URL>

<run media base URL>: the folder of RoboPaint-strict's run media, laid out <run>/<work>/<slot>/replay.webp (slot: unlimited =
open book, limited = closed book). replay.webp is the last frame of the verifier's replay of the trajectory the agent handed
in: a 2 x 2 grid of 320 x 240 tiles (the canvas camera, the scene, the side view, the exact sheet). The exact sheet's tile
is the square sheet resized to 4:3, so it is cut out and resized back to a square. For every run, work and mode in
assets/data/results.json, writes assets/media/attempts/<run>/<work>_<mode>.webp and assets/data/attempts.json (which copies
exist).
"""
import io, json, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

BASE = sys.argv[1].rstrip("/") + "/"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "media" / "attempts"
SLOTS = {"open": "unlimited", "closed": "limited"}
SIZE = 320                                         # the tile's width: the sheet's resolution in the replay

results = json.loads((ROOT / "assets" / "data" / "results.json").read_text())
jobs = [(r["id"], t, mode) for r in results["runs"] for t, modes in sorted(r["tasks"].items()) for mode in modes]


def fetch(job):
    run, task, mode = job
    dest = OUT / run / f"{task}_{mode}.webp"
    if not dest.exists():
        url = f"{BASE}{run}/{task}/{SLOTS[mode]}/replay.webp"
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                grid = Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception as e:                     # no replay: the agent handed in no trajectory
            return job, f"missing ({e})"
        w, h = grid.size
        tile = grid.crop((w // 2, h // 2, w, h)).resize((SIZE, SIZE), Image.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tile.save(dest, "WEBP", quality=90, method=6)
    return job, "ok"


have, missing = {}, []
with ThreadPoolExecutor(8) as pool:
    for (run, task, mode), state in pool.map(fetch, jobs):
        if state == "ok":
            have.setdefault(run, {}).setdefault(task, []).append(mode)
        else:
            missing.append((run, task, mode, state))
out = {"size": SIZE, "copies": have}
(ROOT / "assets" / "data" / "attempts.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(f"{len(jobs) - len(missing)} of {len(jobs)} copies; missing: {missing[:10]}")
print(f"{sum(p.stat().st_size for p in OUT.rglob('*.webp')) / 1e6:.1f} MB")
