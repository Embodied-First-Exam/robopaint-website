#!/bin/bash
# Run capture_reference.py for every work (or the ids given), LANES at a time, in the RoboPaint image with the GPU (SAPIEN needs a
# Vulkan device even without cameras), then grade the reference solution with the task's own verifier (tests/grade.py, one fresh
# replay, no video). Output: OUT/<id>/ (frames/, capture.json, qpos.npy, loaded.npy, grade/{reward.json, canvas.png}); a done
# marker per work.
# usage: IMG=<RoboPaint task image> scripts/capture_all.sh <tasks dir> <out dir> [ids...]   (env: LANES=3 FRAMES=240 SIZE=768)
set -u
TASKS=$(realpath "$1"); OUT=$(realpath "$2"); shift 2
HERE=$(cd "$(dirname "$0")" && pwd)
LANES=${LANES:-1}; FRAMES=${FRAMES:-240}; SIZE=${SIZE:-768}
IMG=${IMG:?set IMG to the RoboPaint task image}
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  mapfile -t ids < <(python3 -c "import json;print('\n'.join(w['id'] for w in json.load(open('$HERE/../assets/data/works.json'))['works']))")
fi
run_one() {
  local id=$1 fam=${1%%_*} tgt=${1#*_}
  local t o="$OUT/$id"
  t=$(ls -d "$TASKS"/robopaint-$fam-$tgt-i0?-privileged 2>/dev/null | tail -1)
  [ -d "$t" ] || { echo "NO TASK $id"; return 1; }
  [ -f "$o/done" ] && return 0
  mkdir -p "$o"; rm -rf "$o/frames" "$o/grade"
  # the frame spacing needs the painted path's length: from works.json, unless OUT/<id>/path_mm.txt is there already
  [ -s "$o/path_mm.txt" ] || python3 -c "import json;w=[x for x in json.load(open('$HERE/../assets/data/works.json'))['works'] if x['id']=='$id'][0];print(w['reference']['path_mm'])" > "$o/path_mm.txt"
  docker run --rm --network none --gpus all -e NVIDIA_DRIVER_CAPABILITIES=all --cpus 4 --memory 6g \
    -v "$t":/task:ro -v "$t/environment/rcb_brush.py":/opt/tools/rcb_brush.py:ro -v "$HERE/capture_reference.py":/work/capture.py:ro \
    -v "$o":/out -e PYTHONPATH=/opt/tools --label rpweb=capture $IMG \
    sh -c "/opt/venv/bin/python /work/capture.py /task /out --frames $FRAMES --size $SIZE > /out/log.txt 2>&1 && \
      /opt/venv/bin/python -c \"import numpy as np; np.savez('/out/traj.npz', actions=np.load('/task/solution/oracle_qpos.npy').astype('float32'))\" && \
      RCB_VERIFIER_LOG_DIR=/out/grade /opt/venv/bin/python /task/tests/grade.py --family robopaint_${fam}_${tgt} --instance /task/tests/instance.json \
        --traj /out/traj.npz --repeat 1 --no-video > /out/grade.log 2>&1; s=\$?; rm -f /out/traj.npz; chown -R $(id -u):$(id -g) /out; exit \$s" \
    && touch "$o/done" && tail -1 "$o/log.txt" || echo "FAILED $id"
}
export -f run_one; export TASKS OUT HERE FRAMES SIZE IMG
printf '%s\n' "${ids[@]}" | xargs -P "$LANES" -I{} bash -c 'run_one {}'
echo "ALL DONE"
