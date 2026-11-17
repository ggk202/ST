// Unit / structure models. The detailed model tables live in model-ground / model-air / model-drones / model-buildings
// (built with the Builder + helper library in model-core). Forward direction is +Z. Geometry is merged per part-group
// (hull / turret / rotor / legs ...) so each unit costs only a few draw calls.
import * as THREE from 'three';
import { PLAYER_COLORS, DEFS } from './sim/defs.js';
import { Builder } from './model-core.js';
import { GROUND } from './model-ground.js';
import { AIR, PROPS_MODELS } from './model-air.js';
import { DRONES } from './model-drones.js';
import { BUILDINGS } from './model-buildings.js';

const MODELS = { ...GROUND, ...AIR, ...DRONES, ...BUILDINGS, ...PROPS_MODELS };

const cache = new Map();
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12, flatShading: true });

// size-threshold scale per model: tiny models keep finer detail longer, big structures drop small parts sooner
const LOD_SCALE = { rifleman: 0.45, at: 0.45, manpads: 0.45, engineer: 0.45, robot: 0.6, repair: 0.6, sapper: 0.5, fpv: 0.3, ewdog: 0.6, carrier: 0.7, empcarrier: 0.7, uav: 0.8 };
export const lodScaleOf = (base) => (DEFS[base] && DEFS[base].kind === 'building') ? 2.5 : (LOD_SCALE[base] || 1);

function geoms(def, team, lod = 0) {
  const key = def + ':' + team + ':' + lod;
  let g = cache.get(key);
  if (!g) {
    const base = DEFS[def] ? DEFS[def].base : def;
    const b = new Builder(PLAYER_COLORS[team % PLAYER_COLORS.length], lod, lodScaleOf(base));
    (MODELS[base] || MODELS.rifleman)(b);
    g = b.finish(); cache.set(key, g);
  }
  return g;
}

// returns { root, turret, rotor, rotor2, parts, ... }. Group names containing a dot ("legL.shin") are children of the
// group before the dot, so limbs can articulate. setLod(n) swaps every part to the geometry of that detail level.
export function makeModel(def, team) {
  const g = geoms(def, team, 0), d = DEFS[def];
  const root = new THREE.Group();
  const out = { root, turret: null, rotor: null, rotor2: null, parts: {}, hull: null, rp: g.rp, chains: g.chains, base: d ? d.base : def, lod: 0, setLod: null, verts: [] };
  const hull = new THREE.Mesh(g.hull, material); hull.castShadow = true; hull.receiveShadow = false; root.add(hull); out.hull = hull; out.parts.hull = hull;
  const names = Object.keys(g).filter((n) => n !== 'hull' && n !== 'rp' && n !== 'chains').sort((a, b) => a.split('.').length - b.split('.').length);
  for (const name of names) {
    const m = new THREE.Mesh(g[name], material); m.castShadow = true;
    const rp = g.rp[name] || [0, 0, 0], dot = name.lastIndexOf('.'), par = dot > 0 ? out.parts[name.slice(0, dot)] : null;
    if (par) { const pr = g.rp[name.slice(0, dot)] || [0, 0, 0]; m.position.set(rp[0] - pr[0], rp[1] - pr[1], rp[2] - pr[2]); par.add(m); }
    else { m.position.set(rp[0], rp[1], rp[2]); root.add(m); }
    out.parts[name] = m;
  }
  delete out.parts.hull;
  out.turret = out.parts.turret || null; out.rotor = out.parts.rotor || null; out.rotor2 = out.parts.rotor2 || null;
  out.setLod = (lod, shadow = true) => {
    const gl = geoms(def, team, lod);
    const set = (mesh, geo) => { if (geo) { if (mesh.geometry !== geo) mesh.geometry = geo; mesh.visible = true; } else mesh.visible = false; mesh.castShadow = shadow && lod < 2; };
    set(hull, gl.hull); for (const n in out.parts) set(out.parts[n], gl[n]);
    out.lod = lod;
  };
  if (d && d.kind === 'unit' && d.tier > 1) root.scale.setScalar(1 + 0.07 * (d.tier - 1));
  return out;
}
export { material as modelMaterial };
