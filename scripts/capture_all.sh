#!/bin/bash
# Run capture_reference.py for every work (or the ids given), LANES at a time, in the RoboPaint image with the GPU (SAPIEN needs a
# Vulkan device even without cameras). Output: OUT/<id>/ (frames/, capture.json, qpos.npy, loaded.npy); a done marker per work.
# usage: IMG=<RoboPaint task image> scripts/capture_all.sh <tasks dir> <out dir> [ids...]   (env: LANES=3 FRAMES=240 SIZE=768)
set -u
TASKS=$(realpath "$1"); OUT=$(realpath "$2"); shift 2
HERE=$(cd "$(dirname "$0")" && pwd)
LANES=${LANES:-3}; FRAMES=${FRAMES:-240}; SIZE=${SIZE:-768}
IMG=${IMG:?set IMG to the RoboPaint task image}
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  mapfile -t ids < <(python3 -c "import json;print('\n'.join(w['id'] for w in json.load(open('$HERE/../assets/data/works.json'))['works']))")
fi
run_one() {
  local id=$1 fam=${1%%_*} tgt=${1#*_}
  local t="$TASKS/robopaint-strict-$fam-$tgt-i00-privileged" o="$OUT/$id"
  [ -f "$o/done" ] && return 0
  mkdir -p "$o"; rm -rf "$o/frames"
  python3 -c "import json;w=[x for x in json.load(open('$HERE/../assets/data/works.json'))['works'] if x['id']=='$id'][0];print(w['reference']['path_mm'])" > "$o/path_mm.txt"
  docker run --rm --network none --gpus all -e NVIDIA_DRIVER_CAPABILITIES=all --cpus 4 --memory 6g \
    -v "$t":/task:ro -v "$t/environment/rcb_brush.py":/opt/tools/rcb_brush.py:ro -v "$HERE/capture_reference.py":/work/capture.py:ro \
    -v "$o":/out -e PYTHONPATH=/opt/tools --label rpweb=capture $IMG \
    sh -c "/opt/venv/bin/python /work/capture.py /task /out --frames $FRAMES --size $SIZE > /out/log.txt 2>&1; s=\$?; chown -R $(id -u):$(id -g) /out; exit \$s" \
    && touch "$o/done" && tail -1 "$o/log.txt" || echo "FAILED $id"
}
export -f run_one; export TASKS OUT HERE FRAMES SIZE IMG
printf '%s\n' "${ids[@]}" | xargs -P "$LANES" -I{} bash -c 'run_one {}'
echo "ALL DONE"
