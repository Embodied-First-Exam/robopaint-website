#!/usr/bin/env python3
"""Replay a work's reference solution with the task's own tooling and keep what the site shows of it (runs INSIDE the
RoboPaint task image, with the task's environment/rcb_brush.py on PYTHONPATH).

usage: capture_reference.py <task dir> <out dir> [--frames 240] [--size 768] [--actions trajectory.npz] [--camera]

<task dir>: robopaint-strict-<family>-<target>-i00-privileged/ (environment/instance.json, target.png, solution/
oracle_qpos.npy). The replay is the graders' own: Session(...) from the frozen instance, the reference actions one control
step at a time, no rendering (the sheet is the brush engine's exact image, not a camera's).

Writes to <out dir>:
- frames/%05d.png: the main sheet at --size px, one frame each time the inked path has grown by 1/--frames of its final
  length (the canvas grows evenly; travel, dips and pauses take no frames), plus the finished sheet as the last frame;
- capture.json: per frame the control step, the stroke number and the loaded paint; the strokes (paint, path in sheet mm
  thinned to 0.5 mm, press); the run's length; the sheet's frame;
- qpos.npy: the measured joint positions at every control step (T x 7, float32), loaded.npy: the loaded paint per step
  (-1 = dry), contact.npy: 1 while the brush paints the main sheet, for the 3D replay.
--actions: replay another trajectory instead of the reference (an agent's trajectory.npz, key "actions"); --camera: also save
what the overhead canvas camera sees at the end (camera.png; the closed-book mode's view; needs rendering, so a GPU).
"""
import json, math, sys, time
from pathlib import Path
import numpy as np
from PIL import Image

task, out = Path(sys.argv[1]), Path(sys.argv[2])
FRAMES = int(sys.argv[sys.argv.index("--frames") + 1]) if "--frames" in sys.argv else 240
ACTIONS = sys.argv[sys.argv.index("--actions") + 1] if "--actions" in sys.argv else None
CAMERA = "--camera" in sys.argv
SIZE = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 768
from rcb_brush import Session  # noqa: E402  (the task's tooling, mounted at /opt/tools)

t0 = time.time()
env = task / "environment"
s = Session(instance=str(env / "instance.json"), render=CAMERA, base_dir=str(env))
actions = (np.load(ACTIONS)["actions"] if ACTIONS else np.load(task / "solution" / "oracle_qpos.npy")).astype(np.float32)
s.reset()
wells = [w["name"] for w in s.inst["wells"]["wells"]]
(out / "frames").mkdir(parents=True, exist_ok=True)


def loaded_index():
    """The paint on the brush: the well's index (the paintings), 0 for ink (one well), -1 when dry."""
    c = getattr(s.painter, "color", None)
    if c is not None:
        return int(c)
    return 0 if s.painter.loaded else -1


def shot(k):
    img = Image.fromarray(s.canvas("main"))
    if SIZE != img.width:
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(out / "frames" / f"{k:05d}.png", optimize=False, compress_level=1)


# the run's inked path, for an even capture: a first pass is the replay itself, so estimate it from the reference's realized
# path when known (capture.json of an earlier pass) or else from the actions; here the path is measured while replaying and
# frames are taken at a fixed spacing in mm, chosen from the realized path of the strokes of a quick dry estimate
est = None
if (out / "path_mm.txt").exists():
    est = float((out / "path_mm.txt").read_text())
spacing = (est / FRAMES) if est else None

qpos = np.zeros((len(actions), 7), np.float32)
loaded = np.zeros(len(actions), np.int16)
contact = np.zeros(len(actions), np.uint8)       # 1 while the loaded brush is on the main sheet (painting)
frames, path, last_xy, since = [], 0.0, None, 0.0
for i, a in enumerate(actions):
    s.step(a)
    qpos[i] = s.joint_positions()[:7]
    loaded[i] = loaded_index()
    cur = s.painter.cur
    if cur is not None and cur.get("sheet") == "main" and cur.get("inked", True):
        contact[i] = 1
        p = s.tip_pose()[0]
        xy = (p[0], p[1])
        if last_xy is not None:
            d = math.hypot(xy[0] - last_xy[0], xy[1] - last_xy[1]) * 1000.0
            path += d; since += d
        last_xy = xy
        if spacing and since >= spacing:
            since = 0.0
            shot(len(frames))
            frames.append({"step": i, "stroke": len(s.painter.strokes) + 1, "paint": int(loaded[i]), "path_mm": round(path, 1)})
    else:
        last_xy = None
shot(len(frames))
frames.append({"step": len(actions) - 1, "stroke": len(s.painter.strokes), "paint": -1, "path_mm": round(path, 1), "final": True})

strokes = []
geo = s.geo
for st in s.strokes():
    if st.get("sheet", "main") != "main" or not st.get("inked", True):
        continue
    smp = np.asarray(st["samples"], np.float64)
    pts, lastp = [], None
    for row in smp:
        X, Y = geo.world_to_mm(row[0], row[1])
        if lastp is None or math.hypot(X - lastp[0], Y - lastp[1]) >= 0.5:
            pts.append([round(float(X), 2), round(float(Y), 2), round(float(row[2]) * 1000, 2)]); lastp = (X, Y)
    strokes.append({"paint": st.get("color") if isinstance(st.get("color"), str) else None, "start": int(st.get("start_sample", 0)),
                    "length_mm": round(float(st.get("length_mm", 0)), 1), "points": pts})

if CAMERA:
    Image.fromarray(s.render_frame("canvas_cam")).save(out / "camera.png")
np.save(out / "qpos.npy", qpos)
np.save(out / "loaded.npy", loaded)
np.save(out / "contact.npy", contact)
(out / "path_mm.txt").write_text(f"{path:.1f}\n")
info = {"task": s.task, "medium": s.medium, "steps": len(actions), "control_hz": int(s.inst.get("control_hz", 20)),
        "path_mm": round(path, 1), "frames": frames, "wells": s.inst["wells"]["wells"], "strokes": strokes,
        "sheet": {"size_mm": round(geo.size_x * 1000, 2), "center_xy": list(geo.center), "px": geo.rows},
        "robot_base": s.inst.get("robot_base"), "wall_s": round(time.time() - t0, 1), "spacing_mm": spacing}
(out / "capture.json").write_text(json.dumps(info))
print(f"{s.task}: {len(actions)} steps, path {path:.0f} mm, {len(frames)} frames, {len(strokes)} strokes, {time.time() - t0:.0f} s")
