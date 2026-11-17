// Unit / structure models. The detailed model tables live in model-ground / model-air / model-drones / model-buildings
// (built with the Builder + helper library in model-core). Forward direction is +Z. Geometry is merged per part-group
// (hull / turret / rotor / legs ...) so each unit costs only a few draw calls.
import * as THREE from 'three';
import { PLAYER_COLORS, DEFS } from './sim/defs.js';
import { Builder } from './model-core.js';
import { GROUND } from './model-ground.js';
import { AIR } from './model-air.js';
import { DRONES } from './model-drones.js';
import { BUILDINGS } from './model-buildings.js';

const MODELS = { ...GROUND, ...AIR, ...DRONES, ...BUILDINGS };

const cache = new Map();
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12, flatShading: true });

function geoms(def, team) {
  const key = def + ':' + team;
  let g = cache.get(key);
  if (!g) {
    const b = new Builder(PLAYER_COLORS[team % PLAYER_COLORS.length]);
    const base = DEFS[def] ? DEFS[def].base : def;
    (MODELS[base] || MODELS.rifleman)(b);
    g = b.finish(); cache.set(key, g);
  }
  return g;
}

// returns { root, turret, rotor, rotor2, parts }; parts maps group name -> mesh (limbs, axles ...)
export function makeModel(def, team) {
  const g = geoms(def, team), d = DEFS[def];
  const root = new THREE.Group();
  const out = { root, turret: null, rotor: null, rotor2: null, parts: {}, hull: null, rp: g.rp, base: d ? d.base : def };
  const hull = new THREE.Mesh(g.hull, material); hull.castShadow = true; hull.receiveShadow = false; root.add(hull); out.hull = hull;
  for (const name in g) {
    if (name === 'hull' || name === 'rp') continue;
    const m = new THREE.Mesh(g[name], material); m.castShadow = true;
    const rp = g.rp[name] || [0, 0, 0]; m.position.set(rp[0], rp[1], rp[2]); root.add(m); out.parts[name] = m;
  }
  out.turret = out.parts.turret || null; out.rotor = out.parts.rotor || null; out.rotor2 = out.parts.rotor2 || null;
  if (d && d.kind === 'unit' && d.tier > 1) root.scale.setScalar(1 + 0.07 * (d.tier - 1));
  return out;
}
export { material as modelMaterial };
