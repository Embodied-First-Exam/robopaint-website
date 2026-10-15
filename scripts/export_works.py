#!/usr/bin/env python3
"""The RoboPaint works for the site: their facts, pictures and the reference robot's paintings.

usage: export_works.py <tasks dir> <reference runs dir> [<reference runs dir> ...]

<tasks dir>: the RoboPaint task directories, read-only: robopaint-<family>-<target>-i0N-privileged/ (task.toml,
environment/instance.json, environment/target.png, solution/program.json for the paintings).
<reference runs dir>: the reference solutions graded with each task's own verifier, the first dir that has the work wins:
either <id>/{canvas.png, grade/reward.json} (scripts/capture_all.sh) or <family>-<target>/logs/{canvas.png, reward.json}.

Writing and lettering are shown cut to their ink (a margin around it, at most 2:1 either way): `view` in works.json is the cut
as fractions of the sheet (x0, y0, x1, y1), and target/painted images (and the timelapses) are cut the same way.
Writes assets/data/works.json and assets/media/works/<id>/{target,painted}.webp (+ 360 px thumbnails).
"""
import json, re, sys, tomllib
from pathlib import Path
from PIL import Image

TASKS, REFS = Path(sys.argv[1]), [Path(p) for p in sys.argv[2:]]
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "media" / "works"
FAMILIES = ["kaishu", "xingshu", "caoshu", "lettering", "acrylic", "oil"]
import numpy as np

# readings and glosses of the calligraphy targets (characters as the tasks write them, traditional script)
GLOSS = {
    "愛": ("ài", "love"), "春": ("chūn", "spring"), "大": ("dà", "great"), "道": ("dào", "the way"), "德": ("dé", "virtue"),
    "風": ("fēng", "wind"), "福": ("fú", "good fortune"), "國": ("guó", "country"), "和": ("hé", "harmony"),
    "厚德載物": ("hòu dé zài wù", "great virtue carries all things"), "花": ("huā", "flower"), "家": ("jiā", "home"),
    "江": ("jiāng", "river"), "靜": ("jìng", "stillness"), "口": ("kǒu", "mouth"), "樂": ("lè", "joy"), "林": ("lín", "forest"),
    "龍": ("lóng", "dragon"), "馬": ("mǎ", "horse"), "明": ("míng", "bright"),
    "寧靜致遠": ("níng jìng zhì yuǎn", "calm reaches far"), "清": ("qīng", "clear"), "然": ("rán", "so it is"),
    "人": ("rén", "person"), "山": ("shān", "mountain"), "水": ("shuǐ", "water"), "書": ("shū", "writing"),
    "天道酬勤": ("tiān dào chóu qín", "heaven rewards diligence"), "天": ("tiān", "sky"), "心": ("xīn", "heart"),
    "永": ("yǒng", "eternal"), "永字八法": ("yǒng zì bā fǎ", "the eight strokes of 永"), "月": ("yuè", "moon"),
    "中": ("zhōng", "middle"), "字": ("zì", "character"), "鳳": ("fèng", "phoenix"), "閒": ("jiān", "between"),
    "惠風和暢": ("huì fēng hé chàng", "a gentle, easy breeze"), "茂林脩竹": ("mào lín xiū zhú", "lush woods, tall bamboo"),
    "天朗氣清": ("tiān lǎng qì qīng", "the sky clear, the air fresh"), "之": ("zhī", "of"), "年": ("nián", "year"),
    "間": ("jiān", "between"), "賢": ("xián", "the worthy"), "同": ("tóng", "together"), "信": ("xìn", "trust"),
    "宇": ("yǔ", "the universe"), "於": ("yú", "at"), "列": ("liè", "row"), "觀": ("guān", "to look"),
    "麟鳳龜龍": ("lín fèng guī lóng", "unicorn, phoenix, tortoise, dragon"), "文": ("wén", "writing"), "真": ("zhēn", "true"),
    "南宮": ("nán gōng", "the southern palace"), "四五少年": ("sì wǔ shào nián", "four or five young men"),
    "中天哥吹分": ("zhōng tiān gē chuī fēn", "song and pipes part the sky"), "北闕臨丹水": ("běi què lín dān shuǐ", "the northern gate above the cinnabar water"),
}
SCRIPTS = {"kaishu": "楷書 regular script", "xingshu": "行書 running script", "caoshu": "草書 cursive script"}



def webp(src, dst, size, q=84):
    im = Image.open(src).convert("RGB")
    if size and im.width > size:
        im = im.resize((size, round(im.height * size / im.width)), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=q, method=6)
    return dst.stat().st_size


def first(pattern, text, default=None):
    m = re.search(pattern, text)
    return m.group(1) if m else default


def ink_view(path, margin=0.06, max_aspect=2.0):
    """The cut around the exemplar's ink as fractions of the sheet (x0, y0, x1, y1)."""
    a = np.asarray(Image.open(path).convert("L"), float)
    ys, xs = np.nonzero(a < 200)
    H, W = a.shape
    x0, x1, y0, y1 = xs.min() / W - margin, (xs.max() + 1) / W + margin, ys.min() / H - margin, (ys.max() + 1) / H + margin
    w, h = x1 - x0, y1 - y0
    if w / h > max_aspect: grow = w / max_aspect - h; y0 -= grow / 2; y1 += grow / 2
    if h / w > max_aspect: grow = h / max_aspect - w; x0 -= grow / 2; x1 += grow / 2
    # inside the sheet: slide back in, then clip
    for lo, hi in ((0, 2), (1, 3)):
        v = [x0, y0, x1, y1]
        if v[lo] < 0: v[hi] -= v[lo]; v[lo] = 0
        if v[hi] > 1: v[lo] -= v[hi] - 1; v[hi] = 1
        x0, y0, x1, y1 = v
    return [round(max(0, x0), 4), round(max(0, y0), 4), round(min(1, x1), 4), round(min(1, y1), 4)]


def cut(src, view):
    im = Image.open(src).convert("RGB")
    if view:
        W, H = im.size
        im = im.crop((round(view[0] * W), round(view[1] * H), round(view[2] * W), round(view[3] * H)))
    return im


def webp_im(im, dst, size, q=84):
    if size and max(im.size) > size:
        k = size / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=q, method=6)


works = []
for d in sorted(TASKS.glob("robopaint-*-i0[0-9]-privileged")):
    m = re.match(r"robopaint-([a-z]+)-([a-z0-9]+)-i0(\d)-privileged$", d.name)
    if not m:
        continue
    family, target = m.group(1), m.group(2)
    tid, wid = f"{family}-{target}", f"{family}_{target}"
    toml = tomllib.loads((d / "task.toml").read_text())
    meta, desc = toml["metadata"], toml["task"]["description"]
    inst = json.loads((d / "environment" / "instance.json").read_text())
    rule = inst["target"]["success"]
    w = {"id": wid, "family": family, "version": f"i0{m.group(3)}", "difficulty": meta.get("difficulty"), "medium": meta.get("medium"),
         "strokes": meta.get("stroke_count"), "budget": rule.get("max_strokes") or meta.get("stroke_budget"),
         "rule": rule, "brush": {k: v for k, v in inst["brush"].items() if k != "preset_json"}}
    w["palette"] = [x["hex"] for x in inst["wells"]["wells"]]
    if family in SCRIPTS:
        chars = first(r"exemplar (?:character|work) (\S+)", desc)
        w.update(title=chars, chars=chars, structure=meta.get("structure"), characters=meta.get("characters"))
        reading, gloss = GLOSS.get(chars, ("", ""))
        w.update(reading=reading, gloss=gloss, script=SCRIPTS[family])
        if family == "kaishu":
            w.update(source="AR PL UKai (Arphic), via Make Me a Hanzi", license="Arphic Public License")
        elif family == "xingshu":
            w.update(source="a public-domain rubbing of running-script calligraphy (Wikimedia Commons)", license="Public domain")
        else:
            w.update(source="張旭 Zhang Xu, 古詩四帖 Four Ancient Poems, a public-domain scan (Wikimedia Commons)", license="Public domain")
        w["view"] = ink_view(d / "environment" / "target.png")
    elif family == "lettering":
        words = first(r"copies the (?:flourished word|line) (.+?) \(engraved", desc) or target
        w.update(title=words, hand=meta.get("hand"), hand_name=meta.get("hand"), letters=meta.get("letters"), pen="pointed_pen",
                 source="an engraved copybook of English round hand, 1741 (public domain), re-drawn for RoboPaint", license="Public domain")
        w["view"] = ink_view(d / "environment" / "target.png")
    else:
        prog = json.loads((d / "solution" / "program.json").read_text()) if (d / "solution" / "program.json").exists() else {}
        txt = prog.get("text", {})
        w.update(title=txt.get("TITLE") or target, artist=meta.get("source_artist"), source=meta.get("source_image"),
                 license=meta.get("source_license"), palette_size=meta.get("palette_size"),
                 brush_sizes_mm=meta.get("brush_sizes_mm"), layers=meta.get("layers"), regions=meta.get("colour_regions"),
                 preset=inst["brush"].get("preset"))
        about = first(r"target\.png \((a [^)]*?\d{4}(?:-\d{2,4})?)\)", desc) or prog.get("description") or ""
        w["about"] = about
        mm = re.search(r"(?:after|of) (.+?)'s (?:woodblock print )?(.+?), ((?:c\. )?\d{4}(?:-\d{2,4})?)$", about)
        if mm:
            w.update(artist=(w.get("artist") or mm.group(1)).replace("Cezanne", "Cézanne"), original=mm.group(2), date=mm.group(3))
    view = w.get("view")
    w["aspect"] = round(((view[2] - view[0]) / (view[3] - view[1])) if view else 1.0, 4)
    w["media"] = {"target": f"assets/media/works/{wid}/target.webp"}
    tgt = cut(d / "environment" / "target.png", view)
    webp_im(tgt, OUT / wid / "target.webp", 900); webp_im(tgt, OUT / wid / "target_s.webp", 360, 80)
    # the reference robot's painting: the reference solution replayed and graded by the task's own verifier
    for R in REFS:
        a, b = R / wid, R / tid / "logs"
        if (a / "canvas.png").exists() and (a / "grade" / "reward.json").exists():
            canvas, rw = a / "canvas.png", json.loads((a / "grade" / "reward.json").read_text()); break
        if (b / "canvas.png").exists() and (b / "reward.json").exists():
            canvas, rw = b / "canvas.png", json.loads((b / "reward.json").read_text()); break
    else:
        canvas = None
    if canvas:
        pim = cut(canvas, view)
        webp_im(pim, OUT / wid / "painted.webp", 900); webp_im(pim, OUT / wid / "painted_s.webp", 360, 80)
        w["media"]["painted"] = f"assets/media/works/{wid}/painted.webp"
        keep = ["success", "final_reward", "iou", "boundary_f", "de_mean", "de_p90", "ssim_L", "edge_corr", "paint_iou",
                "n_strokes", "path_mm", "mark_width_mm", "scribble_share", "n_dips", "n_actions", "register_shift_mm"]
        w["reference"] = {k: rw[k] for k in keep if k in rw}
    works.append(w)

works.sort(key=lambda w: (FAMILIES.index(w["family"]), w["id"]))
(ROOT / "assets" / "data").mkdir(parents=True, exist_ok=True)
(ROOT / "assets" / "data" / "works.json").write_text(json.dumps({"works": works}, ensure_ascii=False, indent=1) + "\n")
for f in FAMILIES:
    ws = [w for w in works if w["family"] == f]
    print(f, len(ws), [(w["id"], w["title"], w.get("strokes"), w.get("budget"), "ref" if "painted" in w["media"] else "-") for w in ws][:6])
print("works", len(works), "without a reference painting:", [w["id"] for w in works if "painted" not in w["media"]])
