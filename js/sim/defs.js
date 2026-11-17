// Game data: units (3 tiers each), buildings, damage tables. Distances in world units (1 cell = 4 units).
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const CELL = 4;
export const UNIT_CAP = 150;
export const PLAYER_COLORS = [0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b];
export const PLAYER_COLOR_NAMES = ['Blue', 'Red', 'Green', 'Amber'];
export const ROMAN = ['', 'I', 'II', 'III'];

// damage multiplier by [damage type][armor class]
export const DMG = {
  bullet: { inf: 1.0, light: 0.45, medium: 0.12, heavy: 0.04, air: 0.35, struct: 0.1 },
  ap:     { inf: 0.3, light: 1.0,  medium: 1.0,  heavy: 0.85, air: 0.1,  struct: 0.5 },
  he:     { inf: 1.2, light: 1.0,  medium: 0.65, heavy: 0.45, air: 0.0,  struct: 1.0 },
  aa:     { inf: 0.0, light: 0.0,  medium: 0.0,  heavy: 0.0,  air: 1.0,  struct: 0.0 },
  blast:  { inf: 1.0, light: 1.0,  medium: 1.0,  heavy: 1.0,  air: 1.0,  struct: 1.5 },
  hpm:    { inf: 0.0, light: 0.15, medium: 0.0,  heavy: 0.0,  air: 0.5,  struct: 0.0 }, // x1 flat against drones
  emp:    { inf: 0.0, light: 0.3,  medium: 0.3,  heavy: 0.3,  air: 0.3,  struct: 0.1 },
};
// damage multiplier of a hit against a particular entity (drones are fried by HPM regardless of armor class)
export function dmgMult(type, armor, drone) { if (type === 'hpm' && drone) return 1; return DMG[type][armor]; }

const W = (o) => Object.assign({ min: 0, kind: 'hit', speed: 0, splash: 0, ground: true, air: false, arc: 0, spread: 0, radar: false, drone: false, stun: 0 }, o);

// per-tier multipliers (Mk I, Mk II, Mk III)
const TS = [null,
  { hp: 1, dmg: 1, cost: 1, time: 1, speed: 1, range: 1, vision: 1, reload: 1 },
  { hp: 1.55, dmg: 1.4, cost: 1.7, time: 1.12, speed: 1.05, range: 1.08, vision: 1.1, reload: 0.95 },
  { hp: 2.4, dmg: 2.0, cost: 3.0, time: 1.25, speed: 1.1, range: 1.15, vision: 1.2, reload: 0.88 },
];
// energy cost as a share of metal cost, by producing building
const ENERGY_SHARE = { hq: 0.4, barracks: 0.4, factory: 0.5, airfield: 0.6, dronebay: 0.8 };

// ---------------------------------------------------------------------------------
// Base (Mk I) unit definitions. techLv = tech level required (1 = Tech Lab, 2 = Advanced Tech Lab).
// Mk II needs tech level >= 1, Mk III needs tech level >= 2.
// ---------------------------------------------------------------------------------
const BASE = {
  // ---- infantry (Barracks) ----
  rifleman: { name: 'Riflemen', desc: 'Cheap infantry. Good against infantry.', from: 'barracks', cost: 100, time: 6, hp: 70, speed: 4.5, armor: 'inf', radius: 1.0, vision: 34,
    weapons: [W({ type: 'bullet', range: 18, dmg: 8, reload: 0.6, air: true })] },
  at: { name: 'AT Team', desc: 'Anti-armor missiles. Weak against infantry.', from: 'barracks', cost: 200, time: 9, hp: 60, speed: 4.2, armor: 'inf', radius: 1.0, vision: 34,
    weapons: [W({ type: 'ap', range: 30, dmg: 60, reload: 2.5, kind: 'missile', speed: 40 })] },
  manpads: { name: 'MANPADS', desc: 'Shoulder-fired anti-air missiles.', from: 'barracks', cost: 200, time: 9, hp: 60, speed: 4.2, armor: 'inf', radius: 1.0, vision: 36,
    weapons: [W({ type: 'aa', range: 40, dmg: 55, reload: 3.0, kind: 'missile', speed: 48, ground: false, air: true })] },
  engineer: { name: 'Engineer', desc: 'Lets you build structures (e.g. oil derricks) far from base.', from: 'hq', cost: 250, time: 12, hp: 60, speed: 4.5, armor: 'inf', radius: 1.0, vision: 30, builder: true, weapons: [] },
  // ---- vehicles (War Factory) ----
  scout: { name: 'Scout Buggy', desc: 'Fast light vehicle with a machine gun.', from: 'factory', cost: 250, time: 10, hp: 200, speed: 12, armor: 'light', radius: 1.6, vision: 52,
    weapons: [W({ type: 'bullet', range: 20, dmg: 7, reload: 0.4 })] },
  ifv: { name: 'IFV', desc: 'Autocannon + ATGM. All-rounder.', from: 'factory', cost: 650, time: 16, hp: 450, speed: 9, armor: 'medium', radius: 2.2, vision: 42,
    weapons: [W({ type: 'bullet', range: 28, dmg: 12, reload: 0.5, air: true }), W({ type: 'ap', range: 36, dmg: 80, reload: 6, kind: 'missile', speed: 42 })] },
  mbt: { name: 'Medium Tank', desc: 'Main battle tank.', from: 'factory', cost: 800, time: 20, hp: 800, speed: 7.5, armor: 'medium', radius: 2.5, vision: 42,
    weapons: [W({ type: 'ap', range: 40, dmg: 70, reload: 2.0, kind: 'shell', speed: 90, splash: 1.5 })] },
  aa: { name: 'Mobile AA', desc: 'Radar-guided flak vehicle. Shreds aircraft and drones.', from: 'factory', cost: 650, time: 16, hp: 380, speed: 8, armor: 'light', radius: 2.2, vision: 50,
    weapons: [W({ type: 'aa', range: 52, dmg: 13, reload: 0.25, ground: false, air: true, radar: true })] },
  sph: { name: 'Self-Prop. Howitzer', desc: 'Long-range artillery. Needs spotters.', from: 'factory', cost: 900, time: 22, hp: 260, speed: 6, armor: 'light', radius: 2.5, vision: 36,
    weapons: [W({ type: 'he', range: 130, min: 30, dmg: 90, reload: 5, kind: 'shell', speed: 55, splash: 8, arc: 0.5, spread: 0.035 })] },
  heavy: { name: 'Heavy Tank', desc: 'Slow, heavily armored.', from: 'factory', techLv: 1, cost: 1400, time: 30, hp: 1700, speed: 5.5, armor: 'heavy', radius: 3.0, vision: 44,
    weapons: [W({ type: 'ap', range: 46, dmg: 120, reload: 2.4, kind: 'shell', speed: 95, splash: 2 })] },
  mlrs: { name: 'Rocket Artillery', desc: 'Area bombardment.', from: 'factory', techLv: 1, cost: 1100, time: 26, hp: 300, speed: 7, armor: 'light', radius: 2.5, vision: 36,
    weapons: [W({ type: 'he', range: 105, min: 25, dmg: 55, reload: 1.6, kind: 'shell', speed: 65, splash: 7, arc: 0.7, spread: 0.06 })] },
  tel: { name: 'Ballistic Missile', desc: 'Devastating long-range missile.', from: 'factory', techLv: 1, cost: 2200, time: 50, hp: 320, speed: 5.5, armor: 'light', radius: 2.8, vision: 36,
    weapons: [W({ type: 'blast', range: 260, min: 70, dmg: 600, reload: 60, kind: 'shell', speed: 70, splash: 16, arc: 90, spread: 0.01 })] },
  ewtruck: { name: 'EW Truck', desc: 'Wide-area jammer. Degrades enemy drones, aircraft radar and missile locks. Drains energy.', from: 'factory', techLv: 1, cost: 800, time: 20, hp: 320, speed: 7, armor: 'light', radius: 2.4, vision: 50,
    ew: { radius: 60 }, upkeep: 7, weapons: [] },
  // ---- aircraft (Airfield) ----
  uav: { name: 'UAV Drone', desc: 'Unarmed recon drone with huge vision.', from: 'airfield', cost: 300, time: 14, hp: 80, speed: 20, armor: 'air', radius: 1.5, vision: 90, air: true, alt: 28, drone: true, weapons: [] },
  heli: { name: 'Attack Helicopter', desc: 'Anti-armor missiles from the air.', from: 'airfield', cost: 1200, time: 28, hp: 380, speed: 16, armor: 'air', radius: 2.5, vision: 52, air: true, alt: 14,
    weapons: [W({ type: 'ap', range: 40, dmg: 45, reload: 1.4, kind: 'missile', speed: 55 })] },
  vtol: { name: 'VTOL Strike Fighter', desc: 'Bombs ground, radar missiles for air.', from: 'airfield', techLv: 1, cost: 1600, time: 36, hp: 320, speed: 30, armor: 'air', radius: 2.5, vision: 60, air: true, alt: 24,
    weapons: [W({ type: 'he', range: 26, dmg: 150, reload: 4, kind: 'shell', speed: 45, splash: 6, spread: 0.1 }), W({ type: 'aa', range: 60, dmg: 50, reload: 1.5, kind: 'missile', speed: 70, ground: false, air: true, radar: true })] },
  ewplane: { name: 'EW Aircraft', desc: 'Airborne jammer. Blinds enemy radar and protects aircraft from missile locks. Drains energy.', from: 'airfield', techLv: 1, cost: 1300, time: 26, hp: 300, speed: 18, armor: 'air', radius: 2.6, vision: 70, air: true, alt: 26,
    ew: { radius: 70 }, upkeep: 9, weapons: [] },
  // ---- drones (Drone Bay) ----
  robot: { name: 'Combat Robot', desc: 'Cheap robotic infantry. Fearless, but vulnerable to EW and HPM.', from: 'dronebay', cost: 140, time: 7, hp: 110, speed: 5.2, armor: 'inf', radius: 1.1, vision: 34, drone: true,
    weapons: [W({ type: 'bullet', range: 20, dmg: 9, reload: 0.5, air: true })] },
  ewdog: { name: 'EW Dog', desc: 'Robot dog that escorts infantry. HPM emitter fries enemy drones; jams radar nearby.', from: 'dronebay', cost: 350, time: 12, hp: 130, speed: 5.8, armor: 'light', radius: 1.2, vision: 40, drone: true, escort: true,
    ew: { radius: 34 }, upkeep: 1.5,
    weapons: [W({ type: 'hpm', range: 30, dmg: 7, reload: 0.15, air: true, drone: true })] },
  sapper: { name: 'Crawler Bomb', desc: 'Fast disposable explosive crawler. Detonates on contact.', from: 'dronebay', cost: 120, time: 6, hp: 45, speed: 9.5, armor: 'light', radius: 1.0, vision: 30, drone: true,
    weapons: [W({ type: 'he', range: 2.8, dmg: 230, reload: 0.2, kind: 'boom', splash: 6.5 })] },
  repair: { name: 'Repair Bot', desc: 'Heals nearby friendly units. Unarmed; follows infantry.', from: 'dronebay', cost: 300, time: 10, hp: 120, speed: 6.5, armor: 'light', radius: 1.4, vision: 36, drone: true, escort: true,
    heal: { radius: 16, rate: 24 }, weapons: [] },
  walker: { name: 'Assault Walker', desc: 'Bipedal combat robot with autocannon and missile pods.', from: 'dronebay', techLv: 1, cost: 1000, time: 22, hp: 900, speed: 6.2, armor: 'medium', radius: 2.4, vision: 42, drone: true,
    weapons: [W({ type: 'bullet', range: 30, dmg: 13, reload: 0.35, air: true }), W({ type: 'ap', range: 38, dmg: 70, reload: 3, kind: 'missile', speed: 45 })] },
  fpv: { name: 'FPV Swarm', desc: 'Three disposable explosive drones per order. Hard to catch, easy to jam or fry.', from: 'dronebay', cost: 240, time: 9, batch: 3, hp: 22, speed: 34, armor: 'air', radius: 0.8, vision: 44, air: true, alt: 12, drone: true,
    weapons: [W({ type: 'he', range: 2.6, dmg: 95, reload: 0.2, kind: 'boom', splash: 4 })] },
  wingman: { name: 'Wingman Drone', desc: 'Jet combat drone: radar missiles for air, light bombs for ground.', from: 'dronebay', techLv: 1, cost: 1100, time: 24, hp: 230, speed: 32, armor: 'air', radius: 2.2, vision: 56, air: true, alt: 22, drone: true,
    weapons: [W({ type: 'aa', range: 55, dmg: 48, reload: 1.6, kind: 'missile', speed: 70, ground: false, air: true, radar: true }), W({ type: 'he', range: 22, dmg: 70, reload: 3, kind: 'shell', speed: 40, splash: 5, spread: 0.1 })] },
  carrier: { name: 'Deep Strike Drone', desc: 'One-way payload carrier with unlimited range. Order it to attack ground anywhere.', from: 'dronebay', techLv: 1, cost: 700, time: 18, hp: 160, speed: 26, armor: 'air', radius: 1.8, vision: 40, air: true, alt: 30, drone: true, strike: true,
    weapons: [W({ type: 'blast', range: 3.2, dmg: 420, reload: 0.2, kind: 'boom', splash: 11 })] },
  empcarrier: { name: 'EMP Carrier', desc: 'One-way drone. Its blast stuns vehicles, drones, aircraft and structures.', from: 'dronebay', techLv: 2, cost: 900, time: 22, hp: 130, speed: 28, armor: 'air', radius: 1.8, vision: 40, air: true, alt: 30, drone: true, strike: true,
    weapons: [W({ type: 'emp', range: 3.2, dmg: 35, reload: 0.2, kind: 'boom', splash: 20, stun: 160 })] },
};

export const UNITS = {};       // every tier, keyed by id ('mbt', 'mbt2', 'mbt3')
export const BASE_UNITS = {};  // tier-1 definitions keyed by base id
export const BASE_ORDER = Object.keys(BASE);
export const unitId = (base, tier) => (tier <= 1 ? base : base + tier);

for (const [key, b] of Object.entries(BASE)) {
  for (let tier = 1; tier <= 3; tier++) {
    const t = TS[tier];
    const d = Object.assign({}, b);
    d.base = key; d.tier = tier; d.id = unitId(key, tier); d.kind = 'unit';
    d.name = tier === 1 ? b.name : b.name + ' Mk ' + ROMAN[tier];
    d.baseName = b.name;
    d.air = !!b.air; d.drone = !!b.drone; d.batch = b.batch || 1;
    d.techLv = Math.max(b.techLv || 0, tier - 1);
    d.hp = Math.round(b.hp * t.hp); d.speed = +(b.speed * (b.speed > 0 ? t.speed : 1)).toFixed(2);
    d.vision = Math.round(b.vision * t.vision);
    d.cost = Math.round(b.cost * t.cost / 5) * 5;
    d.energy = Math.round(b.cost * (ENERGY_SHARE[b.from] || 0.5) * t.cost / 5) * 5;
    d.time = +(b.time * t.time).toFixed(1);
    d.weapons = b.weapons.map((w) => {
      const nw = Object.assign({}, w);
      nw.dmg = Math.round(w.dmg * t.dmg);
      if (w.range > 6) nw.range = Math.round(w.range * t.range);
      nw.reload = +(w.reload * t.reload).toFixed(3);
      if (w.splash) nw.splash = +(w.splash * (1 + 0.06 * (tier - 1))).toFixed(1);
      if (w.stun) nw.stun = Math.round(w.stun * t.dmg);
      return nw;
    });
    if (b.ew) d.ew = { radius: Math.round(b.ew.radius * t.range), power: tier };
    if (b.heal) d.heal = { radius: b.heal.radius, rate: +(b.heal.rate * t.dmg).toFixed(1) };
    if (b.upkeep) d.upkeep = +(b.upkeep * (1 + 0.4 * (tier - 1))).toFixed(1);
    d.maxRange = 0; d.hitsGround = false; d.hitsAir = false;
    for (const w of d.weapons) { d.maxRange = Math.max(d.maxRange, w.range); d.hitsGround = d.hitsGround || w.ground; d.hitsAir = d.hitsAir || w.air; w.reloadTicks = Math.max(1, Math.round(w.reload * TICK_RATE)); }
    d.timeTicks = Math.round(d.time * TICK_RATE);
    UNITS[d.id] = d;
    if (tier === 1) BASE_UNITS[key] = d;
  }
}

export const BUILDINGS = {
  hq: { name: 'Command Center', desc: 'Your base. Lose it and every production building and you are eliminated.', cost: 0, energy: 0, time: 1, size: 4, hp: 3000, armor: 'struct', vision: 56, income: 6, incomeE: 12, capM: 4000, capE: 3000, produces: 'hq', weapons: [] },
  derrick: { name: 'Oil Derrick', desc: 'Generates metal. Must be built on an oil field. Raises metal storage.', cost: 250, energy: 0, time: 18, size: 2, hp: 600, armor: 'struct', vision: 24, income: 12, capM: 400, requires: ['hq'], oil: true, weapons: [] },
  powerplant: { name: 'Power Plant', desc: 'Generates energy. Raises energy storage.', cost: 250, energy: 0, time: 16, size: 2, hp: 700, armor: 'struct', vision: 28, incomeE: 22, capE: 500, requires: ['hq'], weapons: [] },
  barracks: { name: 'Barracks', desc: 'Trains infantry.', cost: 350, energy: 140, time: 20, size: 3, hp: 1000, armor: 'struct', vision: 36, requires: ['hq'], produces: 'barracks', weapons: [] },
  factory: { name: 'War Factory', desc: 'Builds vehicles.', cost: 600, energy: 300, time: 30, size: 4, hp: 1400, armor: 'struct', vision: 36, requires: ['barracks'], produces: 'factory', weapons: [] },
  dronebay: { name: 'Drone Bay', desc: 'Builds combat robots, EW dogs and air drones.', cost: 650, energy: 520, time: 28, size: 4, hp: 1200, armor: 'struct', vision: 36, requires: ['factory'], produces: 'dronebay', weapons: [] },
  airfield: { name: 'Airfield', desc: 'Builds aircraft.', cost: 800, energy: 480, time: 35, size: 5, hp: 1200, armor: 'struct', vision: 40, requires: ['factory'], produces: 'airfield', weapons: [] },
  techlab: { name: 'Tech Lab', desc: 'Unlocks Mk II units and advanced designs.', cost: 700, energy: 400, time: 30, size: 3, hp: 900, armor: 'struct', vision: 36, requires: ['factory'], weapons: [] },
  advtech: { name: 'Advanced Tech Lab', desc: 'Unlocks Mk III units.', cost: 1300, energy: 900, time: 40, size: 3, hp: 1100, armor: 'struct', vision: 36, requires: ['techlab'], weapons: [] },
  turret: { name: 'Gun Turret', desc: 'Defends against ground units.', cost: 300, energy: 120, time: 15, size: 1, hp: 900, armor: 'struct', vision: 52, requires: ['barracks'],
    weapons: [W({ type: 'bullet', range: 40, dmg: 14, reload: 0.35 }), W({ type: 'ap', range: 46, dmg: 60, reload: 2.5, kind: 'shell', speed: 90 })] },
  sam: { name: 'SAM Site', desc: 'Radar-guided defense against aircraft and drones.', cost: 350, energy: 200, time: 15, size: 2, hp: 600, armor: 'struct', vision: 60, requires: ['barracks'],
    weapons: [W({ type: 'aa', range: 75, dmg: 70, reload: 1.8, kind: 'missile', speed: 75, ground: false, air: true, radar: true })] },
  ewtower: { name: 'EW Tower', desc: 'Static jammer: degrades enemy drones, aircraft radar and missile locks in a wide area. Drains energy.', cost: 450, energy: 350, time: 18, size: 2, hp: 500, armor: 'struct', vision: 40, requires: ['techlab'], ew: { radius: 62, power: 2 }, upkeep: 6, weapons: [] },
};

export const BUILD_ORDER = ['derrick', 'powerplant', 'barracks', 'factory', 'dronebay', 'airfield', 'techlab', 'advtech', 'turret', 'sam', 'ewtower'];
export const PRODUCER_KINDS = ['hq', 'barracks', 'factory', 'airfield', 'dronebay'];
export const STORAGE_BASE = { m: 0, e: 0 };

for (const [k, d] of Object.entries(BUILDINGS)) {
  d.id = k; d.base = k; d.tier = 1; d.kind = 'building'; d.radius = d.size * CELL * 0.5; d.income = d.income || 0; d.incomeE = d.incomeE || 0; d.requires = d.requires || [];
  d.maxRange = 0; d.hitsGround = false; d.hitsAir = false;
  for (const w of d.weapons) { d.maxRange = Math.max(d.maxRange, w.range); d.hitsGround = d.hitsGround || w.ground; d.hitsAir = d.hitsAir || w.air; w.reloadTicks = Math.max(1, Math.round(w.reload * TICK_RATE)); }
}
export const DEFS = Object.assign({}, UNITS, BUILDINGS);
