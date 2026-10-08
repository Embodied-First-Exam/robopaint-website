# RoboPaint

The project page of **RoboPaint**, brushwork for code agents, a suite of the Embodied First Exam. It has 82 works of Chinese
calligraphy, Western lettering and painting. A code agent must make each one with a simulated Franka Panda holding a brush or a
pen. The page judges each work on two things: the picture, and the hand that made it.

Live at **https://robopaint.embodied-first-exam.ai**.

## Run it locally
The page is static: plain HTML, CSS and ES modules, with three.js vendored under `vendor/`. There is no build step.
```bash
python3 -m http.server 8766 --bind 127.0.0.1
```
Then open http://localhost:8766. The page fetches each video whole and plays it from memory, so the videos seek on any server.

Preview knobs:
- `?theme=dark` forces night. The moon/sun button switches the theme, and the browser remembers the choice.
- `?hero=0.6` freezes the opening at that scroll fraction.
- `?overview=1` gives a short, static opening.
- `?cam=x,y,z,lx,ly,lz[,fov]` overrides the opening's camera: eye, look point and field of view, in the three.js frame.
- `?frames=video` or `?frames=stills` picks how the opening's sheet is shown. By default desktops play the video and phones
  and tablets step through stills.
- `?focus=works` opens the page at a section.
- `?work=oil_starrynight` opens a work in the viewer.
  - Add `&view=time` for its timelapse, or `&view=film` for its film.
  - Add `&copy=codex-gpt6_luna-xhigh:closed` for an agent's copy.

## What is on the page
1. **The opening** (scroll-driven, real-time WebGL). The reference painter's *Starry Night* is replayed stroke by stroke as
   the page scrolls.
   - The arm follows the recorded joint positions.
   - The brush takes the colour of the paint it last dipped.
   - The sheet shows the brush engine's own picture at that moment.
   - The camera looks down from high on the robot's right, then pulls back to the whole studio.
2. **The statement**: four numbers.
3. **In the studio**: ray-traced films of the reference robot at work, a 25 s teaser of *The Starry Night* and a programme of
   highlights. Each film replays a graded run, and its last sheet is that run's, pixel for pixel.
4. **The collection**: the 82 works by discipline (楷書 kaishu, 行書 xingshu, lettering, acrylic, oil). The viewer compares
   the exemplar with the reference robot's copy, plays the copy being made (the sheet's timelapse) and shows its film.
5. **Written, not coloured in**: the process rules, shown with the brush's own paths.
6. **How a work is judged**: alignment, then the ink for writing and the colour for painting.
7. **Open book, closed book**: the exact sheet against the overhead camera's view.
8. **Results**: GPT-6 Astra and GPT-6 Luna with Codex, every work in both modes.
9. **At the easel**: every copy the two agents handed in, beside its exemplar. The viewer compares the exemplar with any
   of these copies.

## How the data were made
- `assets/data/works.json` and `assets/media/works/<id>/{target,painted}[_s].webp` come from `scripts/export_works.py`. It
  reads the RoboPaint-strict task directories and the graded runs of the reference solutions.
- `assets/media/works/<id>/timelapse.{mp4,json}`:
  - `scripts/capture_reference.py` replays each reference solution with the task's own tooling, inside the RoboPaint task
    image. SAPIEN needs a GPU.
  - It saves a frame of the exact sheet each time the painted path grows by 1/240 of its length.
  - `scripts/capture_all.sh` runs it for every work, and `scripts/encode_timelapses.py` encodes the frames.
- `assets/media/hero/`: the same capture for *The Starry Night*, with 480 frames and the joint positions and contact at every
  step (`scripts/export_hero.py`).
  - Phones and tablets get every second frame as a 640 px still instead of the video. Their browsers (iOS WebKit, Android
    when saving data) decode a video that has never played lazily, or not at all.
  - A desktop browser that shows no video frame within 8 s switches to the stills too.
- `assets/data/robot/panda.{json,bin}` come from `scripts/prepare_panda.py`. It reads ManiSkill 3.0.1's `panda_stick.urdf`
  and the Franka visual meshes.
- `assets/data/figures.json` and `assets/media/figs/` come from `scripts/make_figures.py`:
  - the brush paths;
  - an earlier agent run that coloured a character in, from before the process rules existed;
  - the agreement and ΔE maps;
  - the overhead camera's view.
- `assets/data/results.json` comes from `scripts/export_results.py`, which reads the run records of the batch evaluation of 5
  and 6 October 2026.
- `assets/data/films.json`, `assets/media/works/<id>/film.{mp4,webp}` and `assets/media/studio/` come from
  `scripts/export_films.py`, which reads the ray-traced masters:
  - the reference solutions replayed in each task's own session, rendered with SAPIEN's ray tracer at 2560 × 1440;
  - path-uniform time-lapses;
  - every last sheet checked against the graded run's canvas;
  - here encoded at 1280 × 720 (the teaser at 1920 × 1080).
- `assets/data/attempts.json` and `assets/media/attempts/` come from `scripts/export_attempts.py`:
  - each image is the last frame of the verifier's replay of one attempt in that evaluation;
  - specifically the exact sheet's 320 × 240 tile, resized back to a square.

## Deployment
GitHub Pages serves the `main` branch as it is. `.nojekyll` turns off the Jekyll build, and `CNAME` sets the custom domain.

## Credits and licences
- **Robot**: the Franka Emika Panda, with visual meshes from franka_description via ManiSkill 3, under Apache-2.0
  (`licenses/APACHE-2.0.txt`). The meshes are re-encoded for the page in `assets/data/robot/`.
- **Kaishu exemplars**: characters of AR PL UKai (Arphic Technology), taken from the data of the Make Me a Hanzi project, under
  the Arphic Public License (`licenses/ARPHICPL.TXT`). Modification notice (APL section 2a): the characters were placed on the
  sheet and rendered for RoboPaint in 2026.
- **Xingshu exemplars**: public-domain rubbings from Wikimedia Commons.
- **Oil exemplars**: photographs of public-domain paintings from Wikimedia Commons.
- **Lettering and acrylic exemplars**: made for RoboPaint, under CC0-1.0.
- **Paint**: libmypaint (ISC) with mypaint-brushes (CC0-1.0).
- **Calligraphy brush**: a re-implementation of Wang et al.'s dynamic brush (IROS 2020).
- **three.js**: MIT (`vendor/three/LICENSE`).
- **Fonts**: Bricolage Grotesque, Inter, JetBrains Mono, Instrument Serif and LXGW WenKai TC, loaded from Google Fonts.
