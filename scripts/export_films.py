#!/usr/bin/env python3
"""The films: ray-traced replays of the reference robot at work, for the viewer and the studio section.

usage: export_films.py <masters dir>

<masters dir>:
- per work <family>_<target>/: video.mp4 (1920x1080, 30 fps) and poster.png (the finished sheet, 2560x1440);
- teaser.mp4 and teaser_poster.png: The Starry Night, the camera moving from the brush out to the whole arm;
- highlights.json: the programme.
The masters were rendered with SAPIEN's ray tracer from the replays of the reference solutions; each one's last sheet
equals the graded run's canvas pixel for pixel.

Writes:
- assets/media/works/<id>/film.{mp4,webp}: 1280x720, H.264 CRF 24;
- assets/media/studio/teaser.{mp4,webp}: 1920x1080;
- assets/data/films.json.
"""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

SRC = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[1]
works = [w["id"] for w in json.loads((ROOT / "assets" / "data" / "works.json").read_text())["works"]]


def encode(src, dest, w, h, crf=24):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", f"scale={w}:{h}:flags=lanczos", "-c:v", "libx264", "-preset", "slow",
                    "-crf", str(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(dest)], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return round(float(out.stdout.strip()), 2)


def poster(src, dest, w, h):
    Image.open(src).convert("RGB").resize((w, h), Image.LANCZOS).save(dest, "WEBP", quality=82, method=6)


def one(wid):
    d = SRC / wid
    if not (d / "video.mp4").exists():
        return wid, None
    out = ROOT / "assets" / "media" / "works" / wid
    if not (out / "film.mp4").exists():
        encode(d / "video.mp4", out / "film.mp4", 1280, 720)
    poster(d / "poster.png", out / "film.webp", 1280, 720)
    return wid, duration(out / "film.mp4")


with ThreadPoolExecutor(4) as pool:
    films = {wid: {"duration": s} for wid, s in pool.map(one, works) if s}

studio = ROOT / "assets" / "media" / "studio"; studio.mkdir(parents=True, exist_ok=True)
encode(SRC / "teaser.mp4", studio / "teaser.mp4", 1920, 1080)
poster(SRC / "teaser_poster.png", studio / "teaser.webp", 1920, 1080)
hl = json.loads((SRC / "highlights.json").read_text())
out = {"teaser": {"work": hl["teaser"], "src": "assets/media/studio/teaser.mp4", "poster": "assets/media/studio/teaser.webp",
                  "duration": duration(studio / "teaser.mp4")},
       "programme": [w for w in hl["highlights"] if w in films], "films": films}
(ROOT / "assets" / "data" / "films.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
size = sum(p.stat().st_size for p in (ROOT / "assets" / "media").rglob("film.*")) + sum(p.stat().st_size for p in studio.iterdir())
print(f"{len(films)} films of {len(works)} works; programme {out['programme']}; {size / 1e6:.1f} MB")
