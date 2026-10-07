#!/usr/bin/env python3
"""The agents' results on RoboPaint for the site, from the published run records.

usage: export_results.py <published_runs/robopaint-strict dir>

Input: the run records the Embodied First Exam builds from (<run>.json: per task and slot the state, the grader's metrics,
the agent's wall time and tokens), here the batch evaluation of 5 and 6 October 2026. Slot names: unlimited =
open book (privileged), limited = closed book (standard). Writes assets/data/results.json.
"""
import json, sys
from pathlib import Path

SRC = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[1]
works = {w["id"]: w for w in json.loads((ROOT / "assets" / "data" / "works.json").read_text())["works"]}
FAMILIES = ["kaishu", "xingshu", "lettering", "acrylic", "oil"]
MODES = {"unlimited": "open", "limited": "closed"}
NAMES = {"codex-gpt6_astra-high": ("GPT-6 Astra", "OpenAI", "Codex", "high"),
         "codex-gpt6_luna-xhigh": ("GPT-6 Luna", "OpenAI", "Codex", "xhigh")}
KEEP = ["final_reward", "image_final_reward", "image_success", "strict_ok", "path_mm", "iou", "ssim_L"]

runs = []
for f in sorted(SRC.glob("*.json")):
    d = json.loads(f.read_text())
    model, org, harness, effort = NAMES.get(d["run"], (d["run"], "", "", ""))
    tasks = {}
    for t, slots in d["tasks"].items():
        if t not in works:
            continue
        tasks[t] = {}
        for slot, r in slots.items():
            m = r.get("metrics") or {}
            tasks[t][MODES[slot]] = {"ok": int(r["state"] == "success"), "state": r["state"],
                                     **{k: round(m[k], 4) for k in KEEP if isinstance(m.get(k), (int, float))},
                                     "wall_s": r.get("agent_wall_s")}
    agg = {}
    for mode in ("open", "closed"):
        agg[mode] = {"solved": sum(v[mode]["ok"] for v in tasks.values() if mode in v), "of": sum(1 for v in tasks.values() if mode in v),
                     "families": {fam: {"solved": sum(v[mode]["ok"] for t, v in tasks.items() if mode in v and works[t]["family"] == fam),
                                        "of": sum(1 for t, v in tasks.items() if mode in v and works[t]["family"] == fam)} for fam in FAMILIES}}
    runs.append({"id": d["run"], "model": model, "org": org, "harness": harness, "effort": effort, "summary": agg, "tasks": tasks})
    print(d["run"], {m: (a["solved"], a["of"], {k: v["solved"] for k, v in a["families"].items()}) for m, a in agg.items()})

runs.sort(key=lambda r: -(r["summary"]["open"]["solved"] + r["summary"]["closed"]["solved"]))
out = {"source": "the batch evaluation of 5 and 6 October 2026: Codex with each model, one attempt per work and mode",
       "runs": runs}
(ROOT / "assets" / "data" / "results.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
