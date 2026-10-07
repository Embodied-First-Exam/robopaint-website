// The robot of the opening: ManiSkill's PandaStick (a Franka Emika Panda holding a stick) with RoboPaint's brush tuft
// below the stick, built from assets/data/robot/panda.{json,bin} (scripts/prepare_panda.py) and posed by forward
// kinematics over the URDF's joints: each joint's origin (xyz, then roll-pitch-yaw), then its angle about z.
import * as THREE from 'three';

const BASE = new URL('../data/robot/', import.meta.url);

export async function loadPanda() {
  const [meta, buf] = await Promise.all([fetch(new URL('panda.json', BASE)).then((r) => r.json()), fetch(new URL('panda.bin', BASE)).then((r) => r.arrayBuffer())]);
  return { meta, buf };
}

/** The arm in the world frame of the simulator (+z up, metres), its base at `base`. tuft: {length, radius, dry}. */
export function createPanda({ meta, buf }, { base = [0, 0, 0], tuft }) {
  const group = new THREE.Group();
  group.position.set(...base);
  const mats = new Map();
  const material = (hex) => {
    if (!mats.has(hex)) {
      const dark = parseInt(hex.slice(1), 16) < 0x404040;
      mats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: dark ? 0.55 : 0.38, metalness: dark ? 0.15 : 0.0 }));
    }
    return mats.get(hex);
  };
  const linkObj = new Map();
  for (const link of meta.links) {
    const o = new THREE.Group(); o.name = link.name;
    for (const p of link.parts) {
      if (/^#(ff0000|00ff00|0a8ac7)$/.test(p.color)) continue;          // the tiny coloured status marks: left out
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, p.offset, p.vertices * 3), 3));
      const at = p.offset + p.vertices * 12;
      g.setIndex(new THREE.BufferAttribute(p.index === 'u16' ? new Uint16Array(buf, at, p.triangles * 3) : new Uint32Array(buf, at, p.triangles * 3), 1));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, material(p.color));
      m.castShadow = true; m.receiveShadow = true;
      o.add(m);
    }
    linkObj.set(link.name, o);
  }
  // the chain: parent link -> joint origin -> joint angle -> child link
  const joints = [];
  group.add(linkObj.get('panda_link0'));
  for (const j of meta.joints) {
    const parent = linkObj.get(j.parent), child = linkObj.get(j.child) ?? new THREE.Group();
    const origin = new THREE.Group();
    origin.position.set(...j.xyz);
    origin.rotation.set(j.rpy[0], j.rpy[1], j.rpy[2], 'ZYX');
    const turn = new THREE.Group();
    origin.add(turn); turn.add(child); parent.add(origin);
    if (!linkObj.has(j.child)) linkObj.set(j.child, child);
    if (j.type === 'revolute') joints.push(turn);
  }
  // the tool: the rigid stick, then the brush tuft whose tip is the tool point
  const hand = linkObj.get('panda_hand');
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(meta.stick.radius, meta.stick.radius, meta.stick.length, 24), new THREE.MeshStandardMaterial({ color: '#d9dcde', roughness: 0.42 }));
  stick.rotation.x = Math.PI / 2; stick.position.z = meta.stick.z; stick.castShadow = true;
  hand.add(stick);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(tuft.radius * 1.15, tuft.radius * 1.15, 0.008, 20), new THREE.MeshStandardMaterial({ color: '#8b8f94', roughness: 0.3, metalness: 0.6 }));
  ferrule.rotation.x = Math.PI / 2; ferrule.position.z = meta.tcp.z - 0.002; ferrule.castShadow = true;
  hand.add(ferrule);
  const tuftMat = new THREE.MeshStandardMaterial({ color: tuft.dry, roughness: 0.8 });
  // a round tuft that narrows to a point at the tip (the simulator draws it as a plain cylinder)
  const tuftGeo = new THREE.CylinderGeometry(tuft.radius, tuft.radius * 0.35, tuft.length, 24, 1);
  const tuftMesh = new THREE.Mesh(tuftGeo, tuftMat);
  tuftMesh.rotation.x = -Math.PI / 2; tuftMesh.position.z = meta.tcp.z + tuft.length / 2; tuftMesh.castShadow = true;
  hand.add(tuftMesh);
  return {
    group,
    setJoints(q) { for (let i = 0; i < 7; i++) joints[i].rotation.z = q[i]; },
    setPaint(hex) { tuftMat.color.set(hex || tuft.dry); },
  };
}
