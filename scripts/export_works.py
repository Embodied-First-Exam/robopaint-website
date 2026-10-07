#!/usr/bin/env python3
"""The 82 RoboPaint works for the site: their facts, pictures and the reference robot's paintings.

usage: export_works.py <tasks dir> <reference runs dir>

<tasks dir>: the RoboPaint-strict task directories, read-only: robopaint-strict-<family>-<target>-i00-privileged/
(task.toml, environment/instance.json, environment/target.png, solution/program.json for the paintings).
<reference runs dir>: the reference solutions graded on the built task images:
<family>-<target>/logs/{canvas.png, reward.json, replay.mp4}.

Writes assets/data/works.json and assets/media/works/<id>/{target,painted}.webp (+ 360 px thumbnails).
"""
import json, re, sys, tomllib
from pathlib import Path
from PIL import Image

TASKS, REFS = Path(sys.argv[1]), Path(sys.argv[2])
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "media" / "works"
FAMILIES = ["kaishu", "xingshu", "lettering", "acrylic", "oil"]

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
}
HANDS = {"foundational": "Foundational hand", "italic": "Italic", "uncial": "Uncial", "blackletter": "Blackletter",
         "textura": "Textura (blackletter)", "copperplate": "Copperplate", "roman": "Roman capitals"}


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


works = []
for d in sorted(TASKS.glob("robopaint-strict-*-i00-privileged")):
    tid = d.name[len("robopaint-strict-"):-len("-i00-privileged")]
    family, target = tid.split("-", 1)
    wid = f"{family}_{target}"
    toml = tomllib.loads((d / "task.toml").read_text())
    meta, desc = toml["metadata"], toml["task"]["description"]
    inst = json.loads((d / "environment" / "instance.json").read_text())
    rule = inst["target"]["success"]
    w = {"id": wid, "family": family, "difficulty": meta.get("difficulty"), "medium": meta.get("medium"),
         "strokes": meta.get("stroke_count"), "budget": rule.get("max_strokes") or meta.get("stroke_budget"),
         "rule": rule, "brush": {k: v for k, v in inst["brush"].items() if k != "preset_json"}}
    w["palette"] = [x["hex"] for x in inst["wells"]["wells"]]
    if family in ("kaishu", "xingshu"):
        chars = first(r"exemplar (?:character|work) (\S+)", desc)
        w.update(title=chars, chars=chars, structure=meta.get("structure"), characters=meta.get("characters"))
        reading, gloss = GLOSS.get(chars, ("", ""))
        w.update(reading=reading, gloss=gloss)
        w["script"] = "楷書 regular script" if family == "kaishu" else "行書 running script"
        w["source"] = ("AR PL UKai (Arphic), via Make Me a Hanzi" if family == "kaishu"
                       else "a public-domain rubbing of running-script calligraphy (Wikimedia Commons)")
        w["license"] = "Arphic Public License" if family == "kaishu" else "Public domain"
    elif family == "lettering":
        w.update(title=target, hand=meta.get("hand"), hand_name=HANDS.get(meta.get("hand"), meta.get("hand")),
                 letters=meta.get("letters"), pen=meta.get("medium"), source="made for RoboPaint", license="CC0-1.0")
    else:
        prog = json.loads((d / "solution" / "program.json").read_text()) if (d / "solution" / "program.json").exists() else {}
        txt = prog.get("text", {})
        w.update(title=txt.get("TITLE") or target, artist=meta.get("source_artist"), source=meta.get("source_image"),
                 license=meta.get("source_license"), palette_size=meta.get("palette_size"),
                 brush_sizes_mm=meta.get("brush_sizes_mm"), layers=meta.get("layers"), regions=meta.get("colour_regions"),
                 preset=inst["brush"].get("preset"))
        about = first(r"target\.png \((a [^)]*?\d{4}(?:-\d{2,4})?)\)", desc) or prog.get("description") or ""
        w["about"] = about
        # "after Paul Cezanne's Still Life with Apples and Oranges, c. 1899" -> the artist, the work, its date
        m = re.search(r"(?:after|of) (.+?)'s (?:woodblock print )?(.+?), ((?:c\. )?\d{4}(?:-\d{2,4})?)$", about)
        if m:
            w.update(artist=(w.get("artist") or m.group(1)).replace("Cezanne", "Cézanne"), original=m.group(2), date=m.group(3))
    # the reference robot's painting: the reference solution through the standard path (fresh replay, its grade)
    ref = REFS / tid / "logs"
    w["media"] = {}
    sz = webp(d / "environment" / "target.png", OUT / wid / "target.webp", 900)
    webp(d / "environment" / "target.png", OUT / wid / "target_s.webp", 360, 80)
    w["media"]["target"] = f"assets/media/works/{wid}/target.webp"
    if (ref / "canvas.png").exists():
        webp(ref / "canvas.png", OUT / wid / "painted.webp", 900)
        webp(ref / "canvas.png", OUT / wid / "painted_s.webp", 360, 80)
        w["media"]["painted"] = f"assets/media/works/{wid}/painted.webp"
        rw = json.loads((ref / "reward.json").read_text())
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
