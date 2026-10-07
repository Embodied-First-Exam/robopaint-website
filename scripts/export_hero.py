#!/usr/bin/env python3
"""The opening's data: the reference painter's Starry Night, as the page replays it.

usage: export_hero.py <capture dir of the hero work> <task dir>

<capture dir>: scripts/capture_reference.py's output for the work with dense frames (--frames 480): frames/, capture.json,
qpos.npy, loaded.npy, contact.npy. <task dir>: its robopaint-strict-...-privileged/ (environment/instance.json: the scene).
Writes assets/media/hero/:
- motion.bin: per 10 Hz sample (every second control step) the 7 joint positions as Int16 (offset + 1e-4 rad steps), then a
  Uint8 per sample: bit 0 = painting the main sheet, bits 1-7 = the loaded paint + 1 (0 = dry);
- hero.json: the scene (robot base, the board, the sheets, the plate and its paints, the brush tuft), the joint offsets, the
  frames' samples and strokes, the layers of the reference program;
- hero.mp4: the main sheet frames (768 px, 24 fps, a keyframe every 4 frames so scrolling seeks fast);
- stills/f<frame>.webp: every second frame and the last as 640 px stills, for phones and tablets: their browsers (iOS
  WebKit, Android when saving data) decode a never-played video lazily or not at all, so the page steps through images.
  `--stills-only` writes just these and their list in hero.json (the video and the motion stay as they are).
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

CAP = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "media" / "hero"; OUT.mkdir(parents=True, exist_ok=True)
STILL_EVERY, STILL_SIZE = 2, 640


def write_stills(count):
    d = OUT / "stills"; d.mkdir(exist_ok=True)
    idx = sorted(set(range(0, count, STILL_EVERY)) | {count - 1})
    for k in idx:
        Image.open(CAP / "frames" / f"{k:05d}.png").convert("RGB").resize((STILL_SIZE, STILL_SIZE), Image.LANCZOS) \
            .save(d / f"f{k:04d}.webp", "WEBP", quality=76, method=6)
    print(f"stills: {len(idx)}, {sum(f.stat().st_size for f in d.glob('*.webp')) / 1e6:.1f} MB")
    return {"every": STILL_EVERY, "size": STILL_SIZE, "frames": idx}


if "--stills-only" in sys.argv:
    meta = json.loads((OUT / "hero.json").read_text())
    meta["stills"] = write_stills(meta["frames"]["count"])
    (OUT / "hero.json").write_text(json.dumps(meta, separators=(",", ":")))
    sys.exit(0)

TASK = Path(sys.argv[2])
cap = json.loads((CAP / "capture.json").read_text())
inst = json.loads((TASK / "environment" / "instance.json").read_text())
prog = json.loads((TASK / "solution" / "program.json").read_text())
q, loaded, contact = np.load(CAP / "qpos.npy"), np.load(CAP / "loaded.npy"), np.load(CAP / "contact.npy")

STRIDE = 2                                        # 20 Hz control steps -> 10 Hz samples
n = len(q) // STRIDE
qs = q[: n * STRIDE: STRIDE].astype(np.float64)
cs = contact[: n * STRIDE].reshape(n, STRIDE).max(1)
ls = loaded[: n * STRIDE: STRIDE].astype(np.int64)
mid = np.round((qs.min(0) + qs.max(0)) / 2, 4)
qi = np.round((qs - mid) / 1e-4)
assert np.abs(qi).max() < 32767, "a joint moves more than 3.27 rad from its mid: use a coarser step"
flags = (cs & 1) | ((ls + 1).clip(0, 127) << 1)
(OUT / "motion.bin").write_bytes(qi.astype(np.int16).tobytes() + flags.astype(np.uint8).tobytes())

layers, k = [], 0
for s in prog["strokes"]:
    if not layers or layers[-1]["name"] != s["layer"]:
        layers.append({"name": s["layer"], "first": k + 1, "last": k + 1})
    layers[-1]["last"] = k + 1; k += 1
w = inst["wells"]
scene = {"robot_base": inst["robot_base"], "rest_qpos": inst["robot_qpos"],
         "board": {"center": [-0.1, 0.0, 0.01], "half": [0.4, 0.6, 0.01], "color": "#cccccb"},
         "sheets": [{"name": s["name"], "center": s["center_xy"], "size": [s["cols"] * s["px_m"], s["rows"] * s["px_m"]], "z": s["z"]} for s in inst["sheets"]],
         "plate": {"center": w["plate_center_xy"], "half": w["plate_half_size"], "top": w["plate_top_z"], "surface": w["surface_z"]},
         "wells": [{"hex": x["hex"], "center": x["center_xy"], "r": x["radius_m"]} for x in w["wells"]],
         "tuft": {"length": inst["brush"]["bristle_m"], "radius": inst["brush"]["bristle_r"], "dry": "#dbccad"}}
meta = {"work": "oil_starrynight", "samples": int(n), "hz": 20 / STRIDE, "q_mid": mid.tolist(), "q_step": 1e-4,
        "frames": {"count": len(cap["frames"]), "fps": 24, "sample": [f["step"] // STRIDE for f in cap["frames"]],
                   "stroke": [f["stroke"] for f in cap["frames"]]},
        "strokes": len(prog["strokes"]), "layers": layers, "paints": [x["hex"] for x in w["wells"]], "scene": scene}
meta["stills"] = write_stills(len(cap["frames"]))
(OUT / "hero.json").write_text(json.dumps(meta, separators=(",", ":")))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", str(CAP / "frames" / "%05d.png"), "-vf", "format=yuv420p",
                "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-g", "4", "-keyint_min", "4", "-sc_threshold", "0",
                "-movflags", "+faststart", "-an", str(OUT / "hero.mp4")], check=True)
print(f"samples {n} ({n / 10:.0f} s), painting {cs.mean() * 100:.0f}% of the time, frames {len(cap['frames'])}, layers {[(l['name'], l['first'], l['last']) for l in layers]}")
print({p.name: p.stat().st_size for p in OUT.iterdir()})
