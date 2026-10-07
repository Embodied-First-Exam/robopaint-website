#!/usr/bin/env python3
"""prepare_panda.py <panda_stick.urdf> <visual meshes dir> <out dir>

The robot of the opening: ManiSkill 3.0.1's PandaStick (Franka Emika Panda, its visual meshes from franka_description,
Apache-2.0), the arm RoboPaint's tooling drives (rcb_brush.py adds the brush tuft below the stick). Writes
- panda.bin: every visible part as Float32 positions followed by its triangle indices (Uint16 when it fits, else Uint32);
  parts over 3000 triangles thinned by vertex clustering (1.2 mm cells);
- panda.json: the chain (joint origins xyz / rpy, revolute about z), the fixed hand and tool frames, the stick, and per link
  its parts (offset, sizes, colour).
The page runs the forward kinematics itself (assets/js/robot.js).
"""
import json, sys, math
import xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
import trimesh

urdf, mesh_dir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
root = ET.parse(urdf).getroot()


def cluster(V, F, cell):
    """Vertex clustering: merge the vertices in each `cell`-sized cube, drop the triangles that collapse or repeat."""
    keys = np.floor(V / cell).astype(np.int64)
    _, inv, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    inv = inv.reshape(-1)
    W = np.zeros((counts.size, 3)); np.add.at(W, inv, V); W /= counts[:, None]
    G = inv[F]
    G = G[(G[:, 0] != G[:, 1]) & (G[:, 1] != G[:, 2]) & (G[:, 0] != G[:, 2])]
    _, first = np.unique(np.sort(G, axis=1), axis=0, return_index=True)
    G = G[np.sort(first)]
    used = np.unique(G)
    remap = -np.ones(len(W), np.int64); remap[used] = np.arange(used.size)
    return W[used], remap[G]


def floats(s, n=3):
    v = [float(x) for x in (s or "").split()]
    return v if v else [0.0] * n


joints = []
for j in root.findall("joint"):
    o = j.find("origin")
    a = j.find("axis")
    joints.append({"name": j.get("name"), "type": j.get("type"), "parent": j.find("parent").get("link"), "child": j.find("child").get("link"),
                   "xyz": floats(o.get("xyz") if o is not None else None), "rpy": floats(o.get("rpy") if o is not None else None),
                   "axis": floats(a.get("xyz")) if a is not None else [0, 0, 1],
                   "limit": [float(j.find("limit").get("lower")), float(j.find("limit").get("upper"))] if j.find("limit") is not None else None})

links, parts, blob, offset = [], [], bytearray(), 0
for link in root.findall("link"):
    name = link.get("name")
    entry = {"name": name, "parts": []}
    for vis in link.findall("visual"):
        m = vis.find("geometry/mesh")
        if m is None:
            continue
        f = mesh_dir / Path(m.get("filename")).name
        sc = trimesh.load(f)
        geoms = sc.dump() if isinstance(sc, trimesh.Scene) else [sc]
        for g in geoms:
            V, F = np.asarray(g.vertices, float), np.asarray(g.faces, np.int64)
            mat = getattr(g.visual, "material", None)
            c = np.asarray(getattr(mat, "baseColorFactor", None) if mat is not None else [230, 230, 230, 255], float)[:3]
            c = c / 255.0 if c.max() > 1 else c
            n0 = len(F)
            if len(F) > 3000:
                V, F = cluster(V, F, 0.0012)
            idx16 = len(V) < 65536
            pos = V.astype(np.float32).tobytes(); ind = F.astype(np.uint16 if idx16 else np.uint32).tobytes()
            entry["parts"].append({"offset": offset, "vertices": int(len(V)), "triangles": int(len(F)), "index": "u16" if idx16 else "u32",
                                   "color": "#%02x%02x%02x" % tuple(int(round(255 * x)) for x in c), "from_triangles": int(n0)})
            blob += pos + ind
            pad = (-len(blob)) % 4
            blob += b"\0" * pad
            offset = len(blob)
    links.append(entry)

(out / "panda.bin").write_bytes(bytes(blob))
meta = {"source": "ManiSkill 3.0.1 PandaStick (panda_stick.urdf; Franka Emika Panda visual meshes from franka_description, Apache-2.0)",
        "joints": joints, "links": links,
        "stick": {"link": "panda_hand", "radius": 0.008, "length": 0.1, "z": 0.1},
        "tcp": {"link": "panda_hand", "z": 0.15}}
(out / "panda.json").write_text(json.dumps(meta, separators=(",", ":")))
tris = sum(p["triangles"] for l in links for p in l["parts"])
print(f"links {len(links)}, parts {sum(len(l['parts']) for l in links)}, triangles {tris}, panda.bin {len(blob) / 1e6:.2f} MB")
for l in links:
    if l["parts"]:
        print(f"  {l['name']:14s}", [(p['color'], p['from_triangles'], p['triangles']) for p in l['parts']])
