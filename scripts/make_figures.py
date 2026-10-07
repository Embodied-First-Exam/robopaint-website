#!/usr/bin/env python3
"""The figures of "The hand", "How a work is judged" and the two modes, from the replays (scripts/capture_reference.py).

usage: make_figures.py <capture dir> <special dir> <tasks dir>

<capture dir>/<id>/: the reference solutions' replays; <special dir>/: astra_yong_std (an earlier GPT-6 Astra trajectory
for kaishu 永, standard mode, that coloured the character in with a fine tip: RoboPaint's picture rule passed it, the
process rules fail it), astra_greatwave_priv (the same run's Great Wave, privileged: serpentine and contour fills),
cam_starry (the reference Starry Night with the overhead canvas camera's view at the end). <tasks dir>: the RoboPaint-strict
task directories (the exemplars' target.png).

Writes assets/data/figures.json (brush paths in sheet mm, path lengths, the limits) and assets/media/figs/*.webp.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

CAP, SPE, WT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "assets" / "media" / "figs"; FIG.mkdir(parents=True, exist_ok=True)
works = {w["id"]: w for w in json.loads((ROOT / "assets" / "data" / "works.json").read_text())["works"]}
SHEET = 227.18                                     # mm; the sheet is 1024 px


def last_frame(d):
    return sorted((d / "frames").glob("*.png"))[-1]


def save(img, name, size=None, q=86):
    im = img if isinstance(img, Image.Image) else Image.fromarray(img)
    if size:
        im = im.resize((size, round(im.height * size / im.width)), Image.LANCZOS)
    im.convert("RGB").save(FIG / name, "WEBP", quality=q, method=6)
    return f"assets/media/figs/{name}"


def paths(d, step_mm=0.6, window=None):
    """The inked strokes on the main sheet as polylines (sheet mm, thinned), with their paint (from the loaded paint at the
    stroke's start) and length; window = (x0, y0, x1, y1) mm keeps the parts inside it."""
    cap = json.loads((d / "capture.json").read_text())
    loaded = np.load(d / "loaded.npy")
    wells = [w["hex"] for w in cap["wells"]]
    out = []
    for st in cap["strokes"]:
        P = np.asarray(st["points"], float)[:, :2]
        k = min(len(loaded) - 1, st["start"] // 5)
        paint = wells[int(loaded[k])] if loaded[k] >= 0 else "#131214"
        segs, cur, last = [], [], None
        for x, y in P:
            inside = window is None or (window[0] <= x <= window[2] and window[1] <= y <= window[3])
            if not inside:
                if len(cur) > 1:
                    segs.append(cur)
                cur, last = [], None
                continue
            if last is None or np.hypot(x - last[0], y - last[1]) >= step_mm:
                cur.append([round(x, 2), round(y, 2)]); last = (x, y)
        if len(cur) > 1:
            segs.append(cur)
        for s in segs:
            out.append({"c": paint, "p": s})
    return out, cap["path_mm"]


fig = {}
# ---- the hand, writing: kaishu 永, the reference against a fine tip that coloured it in
w = works["kaishu_yong"]
ref, ref_mm = paths(CAP / "kaishu_yong")
col, col_mm = paths(SPE / "astra_yong_std", step_mm=0.8)
fig["yong"] = {"ref": {"paths": ref, "path_mm": ref_mm, "strokes": len(ref), "img": w["media"]["painted"]},
               "colourin": {"paths": col, "path_mm": col_mm, "img": save(Image.open(last_frame(SPE / "astra_yong_std")), "yong_colourin.webp", 900)},
               "limit_mm": w["rule"]["max_path_mm"], "min_mark_mm": w["rule"]["min_mark_width_mm"]}

# ---- the hand, painting: a window of the Great Wave, the reference's sweeps against serpentine fills
win = (70.0, 70.0, 130.0, 130.0)                   # mm: the wave's crest, where the earlier run's fills loop
w = works["acrylic_greatwave"]
ref_w, ref_w_mm = paths(CAP / "acrylic_greatwave", window=win)
col_w, col_w_mm = paths(SPE / "astra_greatwave_priv", window=win)
px = lambda v: int(round(v / SHEET * 1024))
crop = (px(win[0]), px(win[1]), px(win[2]), px(win[3]))
fig["wave"] = {"window_mm": win,
               "ref": {"paths": ref_w, "img": save(Image.open(last_frame(CAP / "acrylic_greatwave")).resize((1024, 1024)).crop(crop), "wave_ref.webp", 600),
                       "path_mm": json.loads((CAP / "acrylic_greatwave" / "capture.json").read_text())["path_mm"]},
               "scribble": {"paths": col_w, "img": save(Image.open(last_frame(SPE / "astra_greatwave_priv")).resize((1024, 1024)).crop(crop), "wave_scribble.webp", 600),
                            "path_mm": json.loads((SPE / "astra_greatwave_priv" / "capture.json").read_text())["path_mm"]},
               "limit_mm": w["rule"].get("max_path_mm"), "max_scribble_share": w["rule"].get("max_scribble_share")}

# ---- judged, writing: where the robot's ink and the exemplar's agree (kaishu 永, the reference)
tgt = np.asarray(Image.open(WT / "robopaint-strict-kaishu-yong-i00-privileged" / "environment" / "target.png").convert("L"), float) / 255
rob = np.asarray(Image.open(last_frame(CAP / "kaishu_yong")).convert("L").resize((1024, 1024), Image.LANCZOS), float) / 255
ti, ri = tgt < 0.5, rob < 0.5
img = np.full(ti.shape + (3,), 246, np.uint8)
img[ti & ~ri] = (36, 145, 168)                     # the exemplar's ink the robot missed (closed-book teal)
img[ri & ~ti] = (214, 96, 58)                      # the robot's ink outside the exemplar (open-book terracotta)
img[ti & ri] = (24, 26, 30)                        # agreement
iou = float((ti & ri).sum() / max(1, (ti | ri).sum()))
from scipy.ndimage import binary_dilation, binary_erosion
edge = binary_dilation(ti, iterations=3) & ~binary_erosion(ti, iterations=3)     # the exemplar's outline, ~1.3 mm wide
ghost = np.zeros(ti.shape + (4,), np.uint8)       # in vermilion, the rest transparent (the alignment figure)
ghost[..., :3] = (194, 59, 41); ghost[..., 3] = (gaussian_filter(edge.astype(float), 0.8) * 255).clip(0, 255).astype(np.uint8)
Image.fromarray(ghost, "RGBA").resize((900, 900), Image.LANCZOS).save(FIG / "ghost_yong.webp", "WEBP", quality=90, method=6)
fig["agree"] = {"img": save(img, "agree_yong.webp", 900, 90), "iou": round(iou, 3), "rule_iou": works["kaishu_yong"]["rule"]["iou"],
                "ghost": "assets/media/figs/ghost_yong.webp"}


# ---- judged, painting: the colour difference of the reference Starry Night, CIELAB ΔE*ab after a 1 mm blur
def lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


sig = 1.0 / (SHEET / 1024)
blur = lambda a: np.stack([gaussian_filter(a[..., k].astype(float), sig) for k in range(3)], -1)
t_rgb = np.asarray(Image.open(WT / "robopaint-strict-oil-starrynight-i00-privileged" / "environment" / "target.png").convert("RGB"), float)
p_rgb = np.asarray(Image.open(last_frame(CAP / "oil_starrynight")).convert("RGB").resize((1024, 1024), Image.LANCZOS), float)
dE = np.linalg.norm(lab(blur(t_rgb)) - lab(blur(p_rgb)), axis=-1)
inset = int(round(8 / (SHEET / 1024)))
core = dE[inset:-inset, inset:-inset]
# a warm ramp: paper (agrees) -> terracotta -> deep ink (far off)
stops = np.array([[0, 248, 246, 241], [8, 244, 232, 214], [14, 234, 186, 140], [22, 214, 96, 58], [35, 120, 36, 22], [50, 30, 14, 10]], float)
ramp = np.stack([np.interp(dE, stops[:, 0], stops[:, k]) for k in (1, 2, 3)], -1).astype(np.uint8)
fig["delta"] = {"img": save(ramp, "delta_starry.webp", 900, 88), "mean": round(float(core.mean()), 2),
                "p90": round(float(np.percentile(core, 90)), 2), "rule_mean": works["oil_starrynight"]["rule"]["de_mean"],
                "rule_p90": works["oil_starrynight"]["rule"]["de_p90"], "stops": stops[:, 0].tolist()}

# ---- the two modes: the exact sheet (open book) against the overhead camera (closed book)
fig["modes"] = {"exact": works["oil_starrynight"]["media"]["painted"],
                "camera": save(Image.open(SPE / "cam_starry" / "camera.png"), "camera_starry.webp", 900)}
(ROOT / "assets" / "data" / "figures.json").write_text(json.dumps(fig, separators=(",", ":")))
print({k: {kk: (vv if not isinstance(vv, (list, dict)) else '...') for kk, vv in v.items()} for k, v in fig.items()})
print("yong ref paths", len(ref), "colour-in paths", len(col), sum(len(p["p"]) for p in col), "points; wave", len(ref_w), len(col_w))
