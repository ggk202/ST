// Game data: units, buildings, damage tables. All distances in world units (1 cell = 4 units).
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const CELL = 4;
export const UNIT_CAP = 120;
export const PLAYER_COLORS = [0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b];
export const PLAYER_COLOR_NAMES = ['Blue', 'Red', 'Green', 'Amber'];

// damage multiplier by [damage type][armor class]
export const DMG = {
  bullet: { inf: 1.0, light: 0.45, medium: 0.12, heavy: 0.04, air: 0.35, struct: 0.1 },
  ap:     { inf: 0.3, light: 1.0,  medium: 1.0,  heavy: 0.85, air: 0.1,  struct: 0.5 },
  he:     { inf: 1.2, light: 1.0,  medium: 0.65, heavy: 0.45, air: 0.0,  struct: 1.0 },
  aa:     { inf: 0.0, light: 0.0,  medium: 0.0,  heavy: 0.0,  air: 1.0,  struct: 0.0 },
  blast:  { inf: 1.0, light: 1.0,  medium: 1.0,  heavy: 1.0,  air: 0.0,  struct: 1.5 },
};

const W = (o) => Object.assign({ min: 0, kind: 'hit', speed: 0, splash: 0, ground: true, air: false, arc: 0, spread: 0 }, o);

export const UNITS = {
  rifleman: { name: 'Riflemen', desc: 'Cheap infantry. Good against infantry.', from: 'barracks', cost: 100, time: 6, hp: 70, speed: 4.5, armor: 'inf', radius: 1.0, vision: 34, hotkey: 'Q',
    weapons: [W({ type: 'bullet', range: 18, dmg: 8, reload: 0.6, ground: true, air: true })] },
  at: { name: 'AT Team', desc: 'Anti-armor missiles. Weak against infantry.', from: 'barracks', cost: 200, time: 9, hp: 60, speed: 4.2, armor: 'inf', radius: 1.0, vision: 34, hotkey: 'W',
    weapons: [W({ type: 'ap', range: 30, dmg: 60, reload: 2.5, kind: 'missile', speed: 40 })] },
  manpads: { name: 'MANPADS', desc: 'Shoulder-fired anti-air missiles.', from: 'barracks', cost: 200, time: 9, hp: 60, speed: 4.2, armor: 'inf', radius: 1.0, vision: 36, hotkey: 'E',
    weapons: [W({ type: 'aa', range: 40, dmg: 55, reload: 3.0, kind: 'missile', speed: 48, ground: false, air: true })] },
  engineer: { name: 'Engineer', desc: 'Lets you build structures (e.g. oil derricks) far from base.', from: 'hq', cost: 250, time: 12, hp: 60, speed: 4.5, armor: 'inf', radius: 1.0, vision: 30, builder: true, hotkey: 'Q', weapons: [] },
  scout: { name: 'Scout Buggy', desc: 'Fast light vehicle with a machine gun.', from: 'factory', cost: 250, time: 10, hp: 200, speed: 12, armor: 'light', radius: 1.6, vision: 52, hotkey: 'Q',
    weapons: [W({ type: 'bullet', range: 20, dmg: 7, reload: 0.4, ground: true, air: false })] },
  ifv: { name: 'IFV', desc: 'Autocannon + ATGM. All-rounder.', from: 'factory', cost: 650, time: 16, hp: 450, speed: 9, armor: 'medium', radius: 2.2, vision: 42, hotkey: 'W',
    weapons: [W({ type: 'bullet', range: 28, dmg: 12, reload: 0.5, ground: true, air: true }), W({ type: 'ap', range: 36, dmg: 80, reload: 6, kind: 'missile', speed: 42 })] },
  mbt: { name: 'Medium Tank', desc: 'Main battle tank.', from: 'factory', cost: 800, time: 20, hp: 800, speed: 7.5, armor: 'medium', radius: 2.5, vision: 42, hotkey: 'E',
    weapons: [W({ type: 'ap', range: 40, dmg: 70, reload: 2.0, kind: 'shell', speed: 90, splash: 1.5 })] },
  aa: { name: 'Mobile AA', desc: 'Flak vehicle. Shreds aircraft.', from: 'factory', cost: 650, time: 16, hp: 380, speed: 8, armor: 'light', radius: 2.2, vision: 50, hotkey: 'R',
    weapons: [W({ type: 'aa', range: 52, dmg: 13, reload: 0.25, ground: false, air: true })] },
  sph: { name: 'Self-Prop. Howitzer', desc: 'Long-range artillery. Needs spotters.', from: 'factory', cost: 900, time: 22, hp: 260, speed: 6, armor: 'light', radius: 2.5, vision: 36, hotkey: 'T',
    weapons: [W({ type: 'he', range: 130, min: 30, dmg: 90, reload: 5, kind: 'shell', speed: 55, splash: 8, arc: 0.5, spread: 0.035 })] },
  heavy: { name: 'Heavy Tank', desc: 'Slow, heavily armored. Needs Tech Lab.', from: 'factory', tech: ['techlab'], cost: 1400, time: 30, hp: 1700, speed: 5.5, armor: 'heavy', radius: 3.0, vision: 44, hotkey: 'Y',
    weapons: [W({ type: 'ap', range: 46, dmg: 120, reload: 2.4, kind: 'shell', speed: 95, splash: 2 })] },
  mlrs: { name: 'Rocket Artillery', desc: 'Area bombardment. Needs Tech Lab.', from: 'factory', tech: ['techlab'], cost: 1100, time: 26, hp: 300, speed: 7, armor: 'light', radius: 2.5, vision: 36, hotkey: 'U',
    weapons: [W({ type: 'he', range: 105, min: 25, dmg: 55, reload: 1.6, kind: 'shell', speed: 65, splash: 7, arc: 0.7, spread: 0.06 })] },
  tel: { name: 'Ballistic Missile', desc: 'Devastating long-range missile. Needs Tech Lab.', from: 'factory', tech: ['techlab'], cost: 2200, time: 50, hp: 320, speed: 5.5, armor: 'light', radius: 2.8, vision: 36, hotkey: 'I',
    weapons: [W({ type: 'blast', range: 260, min: 70, dmg: 600, reload: 60, kind: 'shell', speed: 70, splash: 16, arc: 90, spread: 0.01 })] },
  uav: { name: 'UAV Drone', desc: 'Unarmed recon drone with huge vision.', from: 'airfield', cost: 300, time: 14, hp: 80, speed: 20, armor: 'air', radius: 1.5, vision: 90, air: true, alt: 28, hotkey: 'Q', weapons: [] },
  heli: { name: 'Attack Helicopter', desc: 'Anti-armor missiles from the air.', from: 'airfield', cost: 1200, time: 28, hp: 380, speed: 16, armor: 'air', radius: 2.5, vision: 52, air: true, alt: 14, hotkey: 'W',
    weapons: [W({ type: 'ap', range: 40, dmg: 45, reload: 1.4, kind: 'missile', speed: 55 })] },
  vtol: { name: 'VTOL Strike Fighter', desc: 'Bombs ground, missiles for air. Needs Tech Lab.', from: 'airfield', tech: ['techlab'], cost: 1600, time: 36, hp: 320, speed: 30, armor: 'air', radius: 2.5, vision: 60, air: true, alt: 24, hotkey: 'E',
    weapons: [W({ type: 'he', range: 26, dmg: 150, reload: 4, kind: 'shell', speed: 45, splash: 6, spread: 0.1 }), W({ type: 'aa', range: 60, dmg: 50, reload: 1.5, kind: 'missile', speed: 70, ground: false, air: true })] },
};

export const BUILDINGS = {
  hq: { name: 'Command Center', desc: 'Your base. Lose it and every production building and you are eliminated.', cost: 0, time: 1, size: 4, hp: 3000, armor: 'struct', vision: 56, income: 4, produces: 'hq', weapons: [] },
  derrick: { name: 'Oil Derrick', desc: 'Generates income. Must be built on an oil field.', cost: 250, time: 18, size: 2, hp: 600, armor: 'struct', vision: 24, income: 5, requires: ['hq'], oil: true, weapons: [], hotkey: 'Q' },
  barracks: { name: 'Barracks', desc: 'Trains infantry.', cost: 350, time: 20, size: 3, hp: 1000, armor: 'struct', vision: 36, requires: ['hq'], produces: 'barracks', weapons: [], hotkey: 'W' },
  factory: { name: 'War Factory', desc: 'Builds vehicles.', cost: 600, time: 30, size: 4, hp: 1400, armor: 'struct', vision: 36, requires: ['barracks'], produces: 'factory', weapons: [], hotkey: 'E' },
  airfield: { name: 'Airfield', desc: 'Builds aircraft.', cost: 800, time: 35, size: 5, hp: 1200, armor: 'struct', vision: 40, requires: ['factory'], produces: 'airfield', weapons: [], hotkey: 'R' },
  techlab: { name: 'Tech Lab', desc: 'Unlocks advanced units.', cost: 700, time: 30, size: 3, hp: 900, armor: 'struct', vision: 36, requires: ['factory'], weapons: [], hotkey: 'T' },
  turret: { name: 'Gun Turret', desc: 'Defends against ground units.', cost: 300, time: 15, size: 1, hp: 900, armor: 'struct', vision: 52, requires: ['barracks'], hotkey: 'Y',
    weapons: [W({ type: 'bullet', range: 40, dmg: 14, reload: 0.35, ground: true, air: false }), W({ type: 'ap', range: 46, dmg: 60, reload: 2.5, kind: 'shell', speed: 90, ground: true, air: false })] },
  sam: { name: 'SAM Site', desc: 'Defends against aircraft.', cost: 350, time: 15, size: 2, hp: 600, armor: 'struct', vision: 60, requires: ['barracks'], hotkey: 'U',
    weapons: [W({ type: 'aa', range: 75, dmg: 70, reload: 1.8, kind: 'missile', speed: 75, ground: false, air: true })] },
};

export const BUILD_ORDER = ['derrick', 'barracks', 'factory', 'airfield', 'techlab', 'turret', 'sam'];
export const PRODUCER_KINDS = ['hq', 'barracks', 'factory', 'airfield'];

for (const [k, d] of Object.entries(UNITS)) {
  d.id = k; d.kind = 'unit'; d.air = !!d.air; d.tech = d.tech || [];
  d.maxRange = 0; d.hitsGround = false; d.hitsAir = false;
  for (const w of d.weapons) { d.maxRange = Math.max(d.maxRange, w.range); d.hitsGround = d.hitsGround || w.ground; d.hitsAir = d.hitsAir || w.air; w.reloadTicks = Math.max(1, Math.round(w.reload * TICK_RATE)); }
  d.timeTicks = Math.round(d.time * TICK_RATE);
}
for (const [k, d] of Object.entries(BUILDINGS)) {
  d.id = k; d.kind = 'building'; d.radius = d.size * CELL * 0.5; d.income = d.income || 0; d.requires = d.requires || [];
  d.maxRange = 0; d.hitsGround = false; d.hitsAir = false;
  for (const w of d.weapons) { d.maxRange = Math.max(d.maxRange, w.range); d.hitsGround = d.hitsGround || w.ground; d.hitsAir = d.hitsAir || w.air; w.reloadTicks = Math.max(1, Math.round(w.reload * TICK_RATE)); }
}
export const DEFS = Object.assign({}, UNITS, BUILDINGS);
