// Game data: units (3 tiers each), buildings, damage tables. Distances in world units (1 cell = 4 units).
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const CELL = 4;
export const UNIT_CAP = 320;
const UNIT_COST_K = 0.65, UNIT_TIME_K = 0.5;   // mass production: cheaper and faster units
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

const W = (o) => Object.assign({ min: 0, kind: 'hit', speed: 0, splash: 0, ground: true, air: false, arc: 0, spread: 0, radar: false, drone: false, stun: 0, ammo: 0, sec: false, fx: '' }, o);

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
    weapons: [W({ type: 'bullet', range: 18, dmg: 18, reload: 0.9, air: true })] },
  at: { name: 'AT Team', desc: 'Anti-armor missiles. Weak against infantry.', from: 'barracks', cost: 200, time: 9, hp: 60, speed: 4.2, armor: 'inf', radius: 1.0, vision: 34,
    weapons: [W({ type: 'ap', range: 30, dmg: 520, reload: 8, kind: 'missile', speed: 40 })] },
  manpads: { name: 'MANPADS', desc: 'Shoulder-fired anti-air missiles.', from: 'barracks', cost: 200, time: 9, hp: 60, speed: 4.2, armor: 'inf', radius: 1.0, vision: 36,
    weapons: [W({ type: 'aa', range: 40, dmg: 380, reload: 6, kind: 'missile', speed: 48, ground: false, air: true })] },
  engineer: { name: 'Engineer', desc: 'Lets you build structures (e.g. oil derricks) far from base.', from: 'hq', cost: 250, time: 12, hp: 60, speed: 4.5, armor: 'inf', radius: 1.0, vision: 30, builder: true, weapons: [] },
  // ---- vehicles (War Factory) ----
  scout: { name: 'Scout Buggy', desc: 'Fast light vehicle with a machine gun.', from: 'factory', cost: 250, time: 10, hp: 200, speed: 12, armor: 'light', radius: 1.6, vision: 52,
    weapons: [W({ type: 'bullet', range: 20, dmg: 12, reload: 0.6 })] },
  ifv: { name: 'IFV', desc: 'Autocannon + ATGM. All-rounder.', from: 'factory', cost: 650, time: 16, hp: 400, speed: 9, armor: 'medium', radius: 2.2, vision: 42, aps: { n: 2, range: 15 },
    weapons: [W({ type: 'bullet', range: 28, dmg: 12, reload: 0.5, air: true, sec: true }), W({ type: 'ap', range: 36, dmg: 460, reload: 8, kind: 'missile', speed: 42 })] },
  mbt: { name: 'Medium Tank', desc: 'Main battle tank.', from: 'factory', cost: 800, time: 20, hp: 680, speed: 7.5, armor: 'medium', radius: 2.5, vision: 42, aps: { n: 3, range: 16 },
    weapons: [W({ type: 'ap', range: 40, dmg: 330, reload: 4, kind: 'shell', speed: 90, splash: 1.5 }), W({ type: 'bullet', range: 26, dmg: 14, reload: 0.4, sec: true })] },
  aa: { name: 'Mobile AA', desc: 'Radar-guided flak vehicle with its own search radar. Shreds aircraft and drones.', radar: { range: 65 }, from: 'factory', cost: 650, time: 16, hp: 380, speed: 8, armor: 'light', radius: 2.2, vision: 50,
    weapons: [W({ type: 'aa', range: 52, dmg: 16, reload: 0.25, ground: false, air: true, radar: true })] },
  sph: { name: 'Self-Prop. Howitzer', desc: 'Long-range artillery. Needs spotters.', from: 'factory', cost: 900, time: 22, hp: 260, speed: 6, armor: 'light', radius: 2.5, vision: 36,
    weapons: [W({ type: 'he', range: 130, min: 30, dmg: 320, reload: 7, kind: 'shell', speed: 55, splash: 8, arc: 0.5, spread: 0.035 })] },
  heavy: { name: 'Heavy Tank', desc: 'Slow, heavily armored.', from: 'factory', techLv: 1, cost: 1400, time: 30, hp: 1450, speed: 5.5, armor: 'heavy', radius: 3.0, vision: 44, aps: { n: 4, range: 18 },
    weapons: [W({ type: 'ap', range: 46, dmg: 470, reload: 4.5, kind: 'shell', speed: 95, splash: 2 }), W({ type: 'bullet', range: 28, dmg: 16, reload: 0.35, sec: true })] },
  mlrs: { name: 'Rocket Artillery', desc: 'Area bombardment.', from: 'factory', techLv: 1, cost: 1100, time: 26, hp: 300, speed: 7, armor: 'light', radius: 2.5, vision: 36,
    weapons: [W({ type: 'he', range: 105, min: 25, dmg: 110, fx: 'rocket', reload: 1.6, kind: 'shell', speed: 65, splash: 7, arc: 0.7, spread: 0.06 })] },
  tel: { name: 'Ballistic Missile', desc: 'Devastating long-range missile.', from: 'factory', techLv: 1, cost: 2200, time: 50, hp: 320, speed: 5.5, armor: 'light', radius: 2.8, vision: 36,
    weapons: [W({ type: 'blast', range: 260, min: 70, dmg: 600, reload: 60, kind: 'shell', speed: 70, splash: 16, arc: 90, spread: 0.01 })] },
  ewtruck: { name: 'EW Truck', desc: 'Wide-area jammer. Degrades enemy drones, aircraft radar and missile locks. Drains energy.', from: 'factory', techLv: 1, cost: 800, time: 20, hp: 320, speed: 7, armor: 'light', radius: 2.4, vision: 50,
    ew: { radius: 60 }, upkeep: 7, weapons: [] },
  // ---- aircraft (Airfield) ----
  // rwy = runway level needed (0 = vertical take-off: uses its apron stand). lo = optional loadouts besides the standard one.
  // Loadout fields: cost, prep (ground-crew seconds), dp (munitions depot level), rw (runway level), mods (vision/speed/hp/ewm/upk multipliers), vis (stores shown on the wings).
  uav: { name: 'UAV Drone', rcs: 0.45, desc: 'Unarmed recon drone with huge vision.', from: 'airfield', rwy: 1, cost: 300, time: 14, hp: 80, speed: 20, armor: 'air', radius: 1.5, vision: 90, air: true, fw: true, turn: 0.8, accel: 6, alt: 28, drone: true, weapons: [],
    stdName: 'Recon Suite', stdDesc: 'Standard EO/IR sensor ball.', stdPrep: 2, stdVis: [],
    lo: [
      { id: 'optics', name: 'Long-Range Optics', desc: '+40% vision radius, 10% slower.', cost: 80, prep: 4, mods: { vision: 1.4, speed: 0.9 }, vis: [['optics', 1]], weapons: [] },
      { id: 'rack', name: 'Micro-Munition Rack', desc: 'Three small guided bombs for opportunistic strikes.', cost: 160, prep: 6, vis: [['bomb', 2]], weapons: [W({ type: 'he', range: 8, dmg: 150, reload: 1.0, kind: 'shell', speed: 35, splash: 3, spread: 0.05, ammo: 3 })] },
    ] },
  heli: { name: 'Attack Helicopter', rcs: 0.7, desc: 'Anti-armor missiles from the air. Vertical take-off from an apron stand.', from: 'airfield', rwy: 0, cost: 1200, time: 28, hp: 380, speed: 16, armor: 'air', radius: 2.5, vision: 52, air: true, accel: 7, alt: 14,
    stdName: 'Anti-Armor ATGM', stdDesc: 'Eight radar-quiet tank-killer missiles.', stdPrep: 4, stdVis: [['atgm', 4]],
    weapons: [W({ type: 'ap', range: 40, dmg: 460, reload: 3.1, kind: 'missile', speed: 55, ammo: 8 })],
    lo: [
      { id: 'rockets', name: 'Rocket Pods', desc: 'Unguided HE rockets. Excellent against infantry and light vehicles.', cost: 120, prep: 5, vis: [['rocket', 2]], weapons: [W({ type: 'he', range: 28, dmg: 45, reload: 0.35, fx: 'rocket', kind: 'shell', speed: 50, splash: 3, spread: 0.08, ammo: 28 })] },
      { id: 'aam', name: 'Air Cover', desc: 'Four air-to-air missiles and a door gun. Hunts aircraft and drones.', cost: 160, prep: 5, vis: [['aam', 2]], weapons: [W({ type: 'aa', range: 45, dmg: 380, reload: 2.4, kind: 'missile', speed: 60, ground: false, air: true, ammo: 4 }), W({ type: 'bullet', range: 24, dmg: 8, reload: 0.2, air: true, ammo: 90 })] },
      { id: 'gunship', name: 'Heavy Gunship', desc: 'Chin cannon plus six missiles. Tougher airframe, slower.', cost: 260, prep: 8, dp: 2, mods: { hp: 1.15, speed: 0.92 }, vis: [['atgm', 3], ['rocket', 1]], weapons: [W({ type: 'bullet', range: 30, dmg: 14, reload: 0.18, air: true, ammo: 140 }), W({ type: 'ap', range: 40, dmg: 460, reload: 3.5, kind: 'missile', speed: 55, ammo: 6 })] },
      { id: 'barrage', name: 'Missile Barrage', desc: 'Fourteen heavy anti-armor missiles at a rapid rate of fire.', cost: 320, prep: 10, dp: 2, vis: [['atgm', 7]], weapons: [W({ type: 'ap', range: 44, dmg: 460, reload: 1.5, kind: 'missile', speed: 60, ammo: 14 })] },
    ] },
  vtol: { name: 'VTOL Strike Fighter', radar: { range: 60, arc: 0.5 }, rcs: 0.8, desc: 'Bombs ground, radar missiles for air. Vertical take-off from an apron stand.', from: 'airfield', rwy: 0, techLv: 1, cost: 1600, time: 36, hp: 320, speed: 30, armor: 'air', radius: 2.5, vision: 60, air: true, accel: 10, alt: 24,
    stdName: 'Strike Package', stdDesc: 'Six bombs and two radar missiles.', stdPrep: 5, stdVis: [['bomb', 3], ['aam', 1]],
    weapons: [W({ type: 'he', range: 26, dmg: 420, reload: 5, kind: 'shell', speed: 45, splash: 6, spread: 0.1, ammo: 6 }), W({ type: 'aa', range: 60, dmg: 380, reload: 3, kind: 'missile', speed: 70, ground: false, air: true, radar: true, ammo: 2 })],
    lo: [
      { id: 'cas', name: 'Close Air Support', desc: 'Autocannon and rocket pods for sustained ground attack.', cost: 180, prep: 6, vis: [['rocket', 2]], weapons: [W({ type: 'bullet', range: 26, dmg: 14, reload: 0.2, air: true, ammo: 150 }), W({ type: 'he', range: 30, dmg: 45, reload: 0.3, fx: 'rocket', kind: 'shell', speed: 55, splash: 3, spread: 0.08, ammo: 30 })] },
      { id: 'air', name: 'Air Superiority', desc: 'Six radar-guided missiles and a gun pod.', cost: 200, prep: 6, vis: [['aam', 3]], weapons: [W({ type: 'aa', range: 62, dmg: 380, reload: 2, kind: 'missile', speed: 72, ground: false, air: true, radar: true, ammo: 6 }), W({ type: 'bullet', range: 22, dmg: 9, reload: 0.15, air: true, ammo: 100 })] },
      { id: 'heavy', name: 'Heavy Ordnance', desc: 'Two huge bombs. Devastating against structures; slower with the load.', cost: 520, prep: 14, dp: 3, mods: { speed: 0.85 }, vis: [['heavy', 1]], weapons: [W({ type: 'blast', range: 24, dmg: 900, reload: 5, kind: 'shell', speed: 45, splash: 9, spread: 0.08, ammo: 2 }), W({ type: 'aa', range: 55, dmg: 380, reload: 3, kind: 'missile', speed: 70, ground: false, air: true, ammo: 2 })] },
    ] },
  fighter: { name: 'Air Superiority Fighter', radar: { range: 85, arc: 0.5 }, rcs: 0.9, desc: 'Fast jet with a forward-looking radar. Needs a runway. Radar missiles and cannon; swap loadouts for strike roles.', from: 'airfield', rwy: 1, techLv: 1, cost: 1400, time: 30, hp: 260, speed: 38, armor: 'air', radius: 2.2, vision: 62, air: true, fw: true, turn: 1.0, accel: 14, alt: 28,
    stdName: 'Air Superiority', stdDesc: 'Six radar missiles and a cannon.', stdPrep: 5, stdVis: [['aam', 3]],
    weapons: [W({ type: 'aa', range: 62, dmg: 380, reload: 2.8, kind: 'missile', speed: 75, ground: false, air: true, radar: true, ammo: 6 }), W({ type: 'bullet', range: 22, dmg: 10, reload: 0.12, air: true, ammo: 200 })],
    lo: [
      { id: 'multi', name: 'Multirole', desc: 'Two missiles and four bombs: capable against air and ground.', cost: 160, prep: 6, vis: [['aam', 1], ['bomb', 2]], weapons: [W({ type: 'aa', range: 62, dmg: 380, reload: 2.8, kind: 'missile', speed: 75, ground: false, air: true, radar: true, ammo: 2 }), W({ type: 'he', range: 22, dmg: 300, reload: 2, kind: 'shell', speed: 50, splash: 5, spread: 0.08, ammo: 4 })] },
      { id: 'strike', name: 'Strike Fighter', desc: 'Six heavy bombs and a cannon for ground attack.', cost: 260, prep: 8, dp: 2, vis: [['bomb', 3]], weapons: [W({ type: 'he', range: 22, dmg: 400, reload: 1.5, kind: 'shell', speed: 50, splash: 6, spread: 0.08, ammo: 6 }), W({ type: 'bullet', range: 22, dmg: 10, reload: 0.12, air: true, ammo: 200 })] },
      { id: 'sead', name: 'SEAD', desc: 'Four anti-radiation missiles that home on radars, SAM sites and jammers that are transmitting. Switch emitters off (EMCON) to blind them.', cost: 240, prep: 7, vis: [['aam', 2]], weapons: [W({ type: 'ap', range: 100, dmg: 520, reload: 3, kind: 'missile', speed: 85, ground: true, air: false, arm: true, ammo: 4 }), W({ type: 'bullet', range: 22, dmg: 10, reload: 0.12, air: true, ammo: 200 })] },
      { id: 'intercept', name: 'Fast Interceptor', desc: 'Four long-range missiles, no cannon, 15% faster.', cost: 200, prep: 5, mods: { speed: 1.15 }, vis: [['aam', 2]], weapons: [W({ type: 'aa', range: 70, dmg: 380, reload: 2, kind: 'missile', speed: 80, ground: false, air: true, radar: true, ammo: 4 })] },
    ] },
  bomber: { name: 'Heavy Bomber', rcs: 1.8, desc: 'Large aircraft that needs an extended runway. Carries the heaviest loads; heavy loadouts need a bigger depot.', from: 'airfield', rwy: 2, techLv: 1, cost: 2400, time: 44, hp: 700, speed: 22, armor: 'air', radius: 4.2, vision: 58, air: true, fw: true, turn: 0.32, accel: 3.5, alt: 30,
    stdName: 'Carpet Bombing', stdDesc: 'Thirty light bombs for area saturation.', stdPrep: 8, stdVis: [['bomb', 4]],
    weapons: [W({ type: 'he', range: 12, dmg: 160, reload: 0.35, kind: 'shell', speed: 30, splash: 7, spread: 0.12, ammo: 30 })],
    lo: [
      { id: 'precision', name: 'Precision Bombs', desc: 'Ten guided bombs. Far more damage per drop.', cost: 400, prep: 12, dp: 2, vis: [['bomb', 5]], weapons: [W({ type: 'he', range: 14, dmg: 700, reload: 1.0, kind: 'shell', speed: 35, splash: 5, spread: 0.03, ammo: 10 })] },
      { id: 'buster', name: 'Bunker Busters', desc: 'Four massive bombs. Needs the Heavy Runway and a Level III depot.', cost: 900, prep: 20, dp: 3, rw: 3, mods: { speed: 0.9 }, vis: [['heavy', 2]], weapons: [W({ type: 'blast', range: 14, dmg: 1200, reload: 3, kind: 'shell', speed: 35, splash: 9, spread: 0.03, ammo: 4 })] },
      { id: 'cruise', name: 'Cruise Missiles', desc: 'Six stand-off cruise missiles with 150 range. Needs the Heavy Runway and a Level III depot.', cost: 1000, prep: 22, dp: 3, rw: 3, vis: [['cruise', 3]], weapons: [W({ type: 'he', range: 150, min: 30, dmg: 420, reload: 2.5, kind: 'missile', speed: 75, splash: 7, ammo: 6 })] },
    ] },
  strategic: { name: 'Strategic Bomber', rcs: 1.5, desc: 'Giant long-range bomber carrying the largest bombs in the arsenal. Needs the Heavy Runway.', from: 'airfield', rwy: 3, techLv: 1, cost: 4200, time: 60, hp: 1200, speed: 20, armor: 'air', radius: 5.5, vision: 60, air: true, fw: true, turn: 0.27, accel: 3, alt: 34,
    stdName: 'Heavy Bombs', stdDesc: 'Ten 1-tonne bombs. Wrecks structures and armor columns.', stdPrep: 14, stdVis: [['heavy', 2]],
    weapons: [W({ type: 'blast', range: 14, dmg: 1100, reload: 1.2, kind: 'shell', speed: 35, splash: 12, spread: 0.04, ammo: 10 })],
    lo: [
      { id: 'saturate', name: 'Area Saturation', desc: 'Forty-eight medium bombs dropped in one long run.', cost: 500, prep: 16, dp: 2, vis: [['bomb', 5]], weapons: [W({ type: 'he', range: 14, dmg: 240, reload: 0.22, kind: 'shell', speed: 32, splash: 8, spread: 0.12, ammo: 48 })] },
      { id: 'mega', name: 'Mega Bomb', desc: 'Two colossal 10-tonne bombs. Levels anything in a huge radius. Needs a Level III depot.', cost: 1400, prep: 30, dp: 3, mods: { speed: 0.9 }, vis: [['heavy', 3]], weapons: [W({ type: 'blast', range: 14, dmg: 3600, reload: 5, kind: 'shell', speed: 38, splash: 24, spread: 0.02, ammo: 2 })] },
      { id: 'cruise', name: 'Cruise Salvo', desc: 'Ten stand-off cruise missiles with 170 range. Needs a Level III depot.', cost: 1500, prep: 28, dp: 3, vis: [['cruise', 4]], weapons: [W({ type: 'he', range: 170, min: 30, dmg: 520, reload: 2.0, kind: 'missile', speed: 78, splash: 8, ammo: 10 })] },
    ] },
  airlifter: { name: 'Heavy Transport', rcs: 2.6, desc: 'Huge airlifter. Load troops and vehicles, then fly them to another airfield or airdrop light units anywhere. Needs the Long Runway.', from: 'airfield', rwy: 2, techLv: 1, cost: 2800, time: 44, hp: 1000, speed: 17, armor: 'air', radius: 6.5, vision: 50, air: true, fw: true, turn: 0.25, accel: 3, alt: 26, cargo: true, weapons: [],
    stdName: 'Mixed Cargo', stdDesc: 'Capacity 40: troops, light and heavy vehicles.', stdPrep: 4, stdVis: [], cap: 40,
    lo: [
      { id: 'troops', name: 'Troop Carrier', desc: 'Capacity 80, infantry, drones and light vehicles only (all airdrop-capable).', cost: 100, prep: 5, vis: [], weapons: [], cap: 80, only: 'para' },
      { id: 'pallets', name: 'Supply Pallets', desc: 'Eight parachute supply pallets. Use SUPPLY DROP to release them on a point; any friendly unit or depot nearby draws from them.', cost: 80, prep: 5, vis: [], weapons: [], cap: 0, pallets: 8 },
      { id: 'hauler', name: 'Vehicle Hauler', desc: 'Capacity 60 for tanks and heavy vehicles. Needs the Heavy Runway.', cost: 200, prep: 8, rw: 3, mods: { speed: 0.9 }, vis: [], weapons: [], cap: 60 },
    ] },
  awacs: { name: 'AWACS', desc: 'Large airborne early-warning radar plane. Detects enemy aircraft far beyond visual range and shares the picture with all your air defenses. Drains energy. Needs the Long Runway.', from: 'airfield', rwy: 2, techLv: 1, cost: 2600, time: 40, hp: 650, speed: 15, armor: 'air', radius: 5.5, vision: 70, air: true, fw: true, turn: 0.3, accel: 3, alt: 30, rcs: 2.4, radar: { range: 200 }, upkeep: 10, weapons: [],
    stdName: 'Surveillance Radar', stdDesc: 'Standard long-range air search.', stdPrep: 5, stdVis: [],
    lo: [
      { id: 'longrange', name: 'Extended Range Array', desc: '+25% radar range, 10% slower, more energy.', cost: 150, prep: 7, mods: { rng: 1.25, speed: 0.9, upk: 1.3 }, vis: [], weapons: [] },
      { id: 'hard', name: 'Hardened Airframe', desc: 'Armour: +40% hit points, -10% radar range.', cost: 140, prep: 6, mods: { hp: 1.4, rng: 0.9 }, vis: [], weapons: [] },
    ] },
  spydrone: { name: 'Stealth Spy Drone', desc: 'Huge ultra-high-altitude stealth drone with enormous vision. Out of reach of every weapon and nearly invisible to radar, so it cannot be shot down: only electronic jamming (EW towers, trucks, aircraft; double reach against it) blinds it. Needs the Long Runway.', from: 'airfield', rwy: 2, techLv: 1, cost: 1900, time: 34, hp: 400, speed: 24, armor: 'air', radius: 5.0, vision: 150, air: true, fw: true, turn: 0.35, accel: 4, alt: 70, rcs: 0.04, drone: true, spy: true, untouchable: true, weapons: [],
    stdName: 'Wide-Area Survey', stdDesc: 'Standard high-resolution survey sensors.', stdPrep: 5, stdVis: [],
    lo: [
      { id: 'deep', name: 'Deep-Look Optics', desc: '+30% vision radius, 10% slower.', cost: 200, prep: 7, mods: { vision: 1.3, speed: 0.9 }, vis: [['optics', 1]], weapons: [] },
    ] },
  ewplane: { name: 'EW Aircraft', desc: 'Airborne jammer. Blinds enemy radar and protects aircraft from missile locks. Drains energy.', from: 'airfield', rwy: 1, techLv: 1, cost: 1300, time: 26, hp: 300, speed: 18, armor: 'air', radius: 2.6, vision: 70, air: true, fw: true, turn: 0.45, accel: 4, alt: 26,
    ew: { radius: 70 }, upkeep: 9, weapons: [],
    stdName: 'Escort Jammer', stdDesc: 'Standard jamming pods.', stdPrep: 4, stdVis: [['jam', 1]],
    lo: [
      { id: 'wide', name: 'Wide-Area Jammer', desc: '+45% jamming radius, +50% energy upkeep, slower.', cost: 140, prep: 6, mods: { ewm: 1.45, upk: 1.5, speed: 0.9 }, vis: [['jam', 2]], weapons: [] },
      { id: 'hard', name: 'Hardened Airframe', desc: 'Armour plating: +40% hit points, -10% jamming radius.', cost: 120, prep: 5, mods: { hp: 1.4, ewm: 0.9 }, vis: [['jam', 1]], weapons: [] },
    ] },
  // ---- drones (Drone Bay) ----
  robot: { name: 'Combat Robot', desc: 'Cheap robotic infantry. Fearless, but vulnerable to EW and HPM.', from: 'dronebay', cost: 140, time: 7, hp: 110, speed: 5.2, armor: 'inf', radius: 1.1, vision: 34, drone: true,
    weapons: [W({ type: 'bullet', range: 20, dmg: 16, reload: 0.8, air: true })] },
  ewdog: { name: 'EW Dog', desc: 'Robot dog that escorts infantry. HPM emitter fries enemy drones; jams radar nearby.', from: 'dronebay', cost: 350, time: 12, hp: 130, speed: 5.8, armor: 'light', radius: 1.2, vision: 40, drone: true, escort: true,
    ew: { radius: 34 }, upkeep: 1.5,
    weapons: [W({ type: 'hpm', range: 30, dmg: 7, reload: 0.15, air: true, drone: true })] },
  sapper: { name: 'Crawler Bomb', desc: 'Fast disposable explosive crawler. Detonates on contact.', from: 'dronebay', cost: 120, time: 6, hp: 45, speed: 9.5, armor: 'light', radius: 1.0, vision: 30, drone: true,
    weapons: [W({ type: 'he', range: 2.8, dmg: 230, reload: 0.2, kind: 'boom', splash: 6.5 })] },
  repair: { name: 'Repair Bot', desc: 'Heals nearby friendly units. Unarmed; follows infantry.', from: 'dronebay', cost: 300, time: 10, hp: 120, speed: 6.5, armor: 'light', radius: 1.4, vision: 36, drone: true, escort: true,
    heal: { radius: 16, rate: 24 }, weapons: [] },
  walker: { name: 'Assault Walker', desc: 'Bipedal combat robot with autocannon and missile pods.', from: 'dronebay', techLv: 1, cost: 1000, time: 22, hp: 800, speed: 6.2, armor: 'medium', radius: 2.4, vision: 42, drone: true, aps: { n: 2, range: 15 },
    weapons: [W({ type: 'bullet', range: 30, dmg: 13, reload: 0.35, air: true }), W({ type: 'ap', range: 38, dmg: 340, reload: 6, kind: 'missile', speed: 45 })] },
  fpv: { name: 'FPV Swarm', desc: 'Three disposable explosive drones per order. Hard to catch, easy to jam or fry.', from: 'dronebay', cost: 240, time: 9, batch: 3, hp: 22, speed: 34, armor: 'air', radius: 0.8, vision: 44, air: true, accel: 40, alt: 12, drone: true,
    weapons: [W({ type: 'he', range: 2.6, dmg: 400, reload: 0.2, kind: 'boom', splash: 4 })] },
  wingman: { name: 'Wingman Drone', desc: 'Jet combat drone: radar missiles for air, light bombs for ground.', from: 'dronebay', techLv: 1, cost: 1100, time: 24, hp: 230, speed: 32, armor: 'air', radius: 2.2, vision: 56, air: true, fw: true, turn: 1.0, accel: 12, alt: 22, drone: true,
    weapons: [W({ type: 'aa', range: 55, dmg: 380, reload: 3.2, kind: 'missile', speed: 70, ground: false, air: true, radar: true }), W({ type: 'he', range: 22, dmg: 160, reload: 5, kind: 'shell', speed: 40, splash: 5, spread: 0.1 })] },
  carrier: { name: 'Deep Strike Drone', desc: 'One-way payload carrier with unlimited range. Order it to attack ground anywhere.', from: 'dronebay', techLv: 1, cost: 700, time: 18, hp: 160, speed: 26, armor: 'air', radius: 1.8, vision: 40, air: true, fw: true, turn: 1.1, accel: 10, alt: 30, drone: true, strike: true,
    weapons: [W({ type: 'blast', range: 3.2, dmg: 420, reload: 0.2, kind: 'boom', splash: 11 })] },
  empcarrier: { name: 'EMP Carrier', desc: 'One-way drone. Its blast stuns vehicles, drones, aircraft and structures.', from: 'dronebay', techLv: 2, cost: 900, time: 22, hp: 130, speed: 28, armor: 'air', radius: 1.8, vision: 40, air: true, fw: true, turn: 1.1, accel: 10, alt: 30, drone: true, strike: true,
    weapons: [W({ type: 'emp', range: 3.2, dmg: 35, reload: 0.2, kind: 'boom', splash: 20, stun: 160 })] },
  // ---- logistics ----
  supplytruck: { name: 'Supply Truck', desc: 'Carries ammunition and supplies. Rearms nearby units, tops up depots and forward bases. Airliftable and airdrop-capable. Toggle AUTO for standing supply runs.', from: 'factory', cost: 450, time: 12, hp: 420, speed: 8.5, armor: 'light', radius: 1.9, vision: 40, supply: { cap: 900, radius: 16, rate: 34 }, weapons: [] },
  tanker: { name: 'Aerial Tanker', rcs: 2.2, desc: 'Refuels friendly aircraft in flight. Park it in a loiter over your front and aircraft low on fuel will rendezvous with it. Needs the Long Runway.', from: 'airfield', rwy: 2, techLv: 1, cost: 2000, time: 38, hp: 650, speed: 17, armor: 'air', radius: 5.2, vision: 56, air: true, fw: true, turn: 0.3, accel: 3, alt: 26, tank: { cap: 2600, range: 46, rate: 38 }, weapons: [],
    stdName: 'Fuel Tanker', stdDesc: 'Full fuel load, boom and drogue.', stdPrep: 6, stdVis: [], lo: [] },
  decoy: { name: 'Radar Decoy', rcs: 1.5, desc: 'Cheap jet drone with a radar enhancer. Radar and SAM operators cannot tell it from a fighter; fly it ahead of a strike to soak up missiles.', from: 'dronebay', techLv: 1, cost: 160, time: 6, hp: 40, speed: 32, armor: 'air', radius: 1.8, vision: 30, air: true, fw: true, turn: 1.2, accel: 12, alt: 26, drone: true, decoy: true, weapons: [] },
};

const FUEL = { fighter: 200, vtol: 170, heli: 170, uav: 420, bomber: 360, strategic: 700, airlifter: 420, awacs: 650, spydrone: 1400, ewplane: 320, tanker: 520, decoy: 100 };
const scaleW = (w, t, tier) => {
  const nw = Object.assign({}, w);
  nw.dmg = Math.round(w.dmg * t.dmg);
  if (w.range > 6) nw.range = Math.round(w.range * t.range);
  nw.reload = +(w.reload * t.reload).toFixed(3);
  if (w.splash) nw.splash = +(w.splash * (1 + 0.06 * (tier - 1))).toFixed(1);
  if (w.stun) nw.stun = Math.round(w.stun * t.dmg);
  return nw;
};
const wStats = (o) => { o.maxRange = 0; o.hitsGround = false; o.hitsAir = false; for (const w of o.weapons) { o.maxRange = Math.max(o.maxRange, w.range); o.hitsGround = o.hitsGround || w.ground; o.hitsAir = o.hitsAir || w.air; w.reloadTicks = Math.max(1, Math.round(w.reload * TICK_RATE)); } };

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
    d.air = !!b.air; d.fw = !!b.fw; d.drone = !!b.drone; d.batch = b.batch || 1;
    d.techLv = Math.max(b.techLv || 0, tier - 1);
    d.hp = Math.round(b.hp * t.hp); d.speed = +(b.speed * (b.speed > 0 ? t.speed : 1)).toFixed(2);
    d.vision = Math.round(b.vision * t.vision);
    d.cost = Math.round(b.cost * UNIT_COST_K * t.cost / 5) * 5;
    d.energy = Math.round(b.cost * UNIT_COST_K * (ENERGY_SHARE[b.from] || 0.5) * t.cost / 5) * 5;
    d.time = +Math.max(2, b.time * UNIT_TIME_K * t.time).toFixed(1);
    d.weapons = b.weapons.map((w) => scaleW(w, t, tier));
    if (b.ew) d.ew = { radius: Math.round(b.ew.radius * t.range), power: tier };
    if (b.heal) d.heal = { radius: b.heal.radius, rate: +(b.heal.rate * t.dmg).toFixed(1) };
    if (b.upkeep) d.upkeep = +(b.upkeep * (1 + 0.4 * (tier - 1))).toFixed(1);
    d.maxRange = 0; d.hitsGround = false; d.hitsAir = false;
    for (const w of d.weapons) { d.maxRange = Math.max(d.maxRange, w.range); d.hitsGround = d.hitsGround || w.ground; d.hitsAir = d.hitsAir || w.air; w.reloadTicks = Math.max(1, Math.round(w.reload * TICK_RATE)); }
    d.hasSec = d.weapons.some((w) => w.sec); d.secRange = d.weapons.reduce((m, w) => (w.sec ? Math.max(m, w.range) : m), 0);
    if (b.aps) d.aps = { n: b.aps.n + tier - 1, range: b.aps.range };
    d.timeTicks = Math.round(d.time * TICK_RATE);
    // ---- logistics: aircraft fuel (seconds of flight), ground ammunition supply, per-shot cost
    if (d.air && FUEL[key]) d.fuel = Math.round(FUEL[key] * (1 + 0.1 * (tier - 1)));
    if (!d.air && d.weapons.length) {
      d.sup = Math.round((['sph', 'mlrs', 'tel'].includes(key) ? 90 : d.armor === 'inf' ? 80 : 140) * (1 + 0.15 * (tier - 1)));
      d.weapons.forEach((w, i) => { w.sc = +Math.min(4, Math.max(0.08, b.weapons[i].dmg / 130)).toFixed(2); });
    }
    if (b.supply) d.supply = { cap: Math.round(b.supply.cap * (1 + 0.25 * (tier - 1))), radius: b.supply.radius, rate: Math.round(b.supply.rate * (1 + 0.2 * (tier - 1))) };
    if (b.tank) d.tank = { cap: Math.round(b.tank.cap * (1 + 0.25 * (tier - 1))), range: b.tank.range, rate: b.tank.rate };
    // ---- higher tiers carry more equipment
    d.kit = [];
    const veh = !d.air && !d.drone && d.armor !== 'inf' && (d.armor === 'light' || d.armor === 'medium' || d.armor === 'heavy') && (b.weapons.length > 0 || b.ew);
    if (veh) {
      if (tier >= 2) { d.ircm = 0.3; d.kit.push('IR countermeasures: flare launchers defeat 30% of guided missiles'); }
      if (tier >= 3) { d.ircm = 0.45; d.ew = d.ew ? { radius: Math.round(d.ew.radius * 1.2), power: d.ew.power } : { radius: 24, power: 1 }; d.upkeep = +((d.upkeep || 0) + 1.2).toFixed(1); d.kit.push('EW suite: personal jammer (24 m), flares upgraded to 45%'); }
    } else if (d.armor === 'inf' && !d.drone) {
      if (tier >= 2) { d.vision = Math.round(d.vision * 1.12); d.kit.push('Thermal sights: +12% vision'); }
      if (tier >= 3) { d.vision = Math.round(d.vision * 1.12); d.kit.push('Smart optics and squad data-link: +25% vision'); }
    } else if (d.air && !d.strike && b.hp >= 60) {
      if (tier >= 2) { d.ircm = 0.3; d.kit.push('Chaff and flare dispensers defeat 30% of guided missiles'); }
      if (tier >= 3) { d.ircm = 0.4; d.laser = { range: 34, pk: 0.7, cd: 50 }; d.kit.push('Directed-energy defense: laser shoots down incoming missiles (no ammo)'); }
    } else if (d.drone && !d.air) {
      if (tier >= 2) { d.jamRes = 0.4; d.kit.push('Hardened comms: 40% less affected by jamming'); }
      if (tier >= 3) { d.jamRes = 0.7; d.kit.push('Shielded electronics: 70% less affected by jamming'); }
    }
    if (b.radar) d.radar = { range: Math.round(b.radar.range * (1 + 0.1 * (tier - 1))), arc: b.radar.arc };
    d.rcs = b.rcs || (b.air || b.from === 'airfield' ? 1 : 0);
    d.slots = d.armor === 'inf' ? 1 : Math.max(2, Math.round(d.radius * d.radius / 1.8)); d.para = !d.air && d.slots <= 2;   // cargo space used / airdrop-compatible
    if (b.from === 'airfield') {
      d.rwy = b.rwy || 0;
      d.loadouts = [{ id: 'std', name: b.stdName, desc: b.stdDesc, cost: 0, prep: b.stdPrep, vis: b.stdVis, mods: {}, weapons: d.weapons, cap: b.cap, only: b.only }].concat((b.lo || []).map((l) => Object.assign({}, l, { weapons: l.weapons.map((w) => scaleW(w, t, tier)) })));
      d.loadouts.forEach((l, i) => {
        l.idx = i; l.mods = l.mods || {}; l.dp = l.dp || 1; l.rw = l.rw !== undefined ? l.rw : d.rwy;
        l.cost = Math.round(l.cost * t.cost / 5) * 5; l.energy = Math.round(l.cost * 0.5 / 5) * 5; l.prepTicks = Math.round(l.prep * TICK_RATE); wStats(l);
        const m = l.mods;
        l.ed = Object.assign({}, d, { weapons: l.weapons, maxRange: l.maxRange, hitsGround: l.hitsGround, hitsAir: l.hitsAir, vision: Math.round(d.vision * (m.vision || 1)), speed: +(d.speed * (m.speed || 1)).toFixed(2), hp: Math.round(d.hp * (m.hp || 1)),
          ew: d.ew ? { radius: Math.round(d.ew.radius * (m.ewm || 1)), power: d.ew.power } : undefined, radar: d.radar ? { range: Math.round(d.radar.range * (m.rng || 1)), arc: d.radar.arc } : undefined, upkeep: d.upkeep ? +(d.upkeep * (m.upk || 1)).toFixed(1) : undefined, lo: l });
      });
    }
    UNITS[d.id] = d;
    if (tier === 1) BASE_UNITS[key] = d;
  }
}

export const BUILDINGS = {
  hq: { name: 'Command Center', desc: 'Your base. Lose it and every production building and you are eliminated.', cost: 0, energy: 0, time: 1, size: 4, hp: 3000, armor: 'struct', vision: 56, income: 14, incomeE: 24, capM: 8000, capE: 6000, produces: 'hq', weapons: [] },
  derrick: { name: 'Oil Derrick', desc: 'Generates metal. Must be built on an oil field. Raises metal storage.', cost: 250, energy: 0, time: 18, size: 2, hp: 600, armor: 'struct', vision: 24, income: 26, capM: 800, requires: ['hq'], oil: true, weapons: [] },
  powerplant: { name: 'Power Plant', desc: 'Generates energy. Raises energy storage.', cost: 250, energy: 0, time: 16, size: 2, hp: 700, armor: 'struct', vision: 28, incomeE: 48, capE: 1000, requires: ['hq'], weapons: [] },
  barracks: { name: 'Barracks', desc: 'Trains infantry.', cost: 350, energy: 140, time: 20, size: 3, hp: 1000, armor: 'struct', vision: 36, requires: ['hq'], produces: 'barracks', weapons: [] },
  factory: { name: 'War Factory', desc: 'Builds vehicles.', cost: 600, energy: 300, time: 30, size: 4, hp: 1400, armor: 'struct', vision: 36, requires: ['barracks'], produces: 'factory', weapons: [] },
  dronebay: { name: 'Drone Bay', desc: 'Builds combat robots, EW dogs and air drones.', cost: 650, energy: 520, time: 28, size: 4, hp: 1200, armor: 'struct', vision: 36, requires: ['factory'], produces: 'dronebay', weapons: [] },
  airfield: { name: 'Airfield', desc: 'Builds, arms and launches aircraft. Extend it with a longer runway, more hangar bays and a munitions depot.', cost: 800, energy: 480, time: 35, size: 5, hp: 1200, armor: 'struct', vision: 40, requires: ['factory'], produces: 'airfield', weapons: [] },
  techlab: { name: 'Tech Lab', desc: 'Unlocks Mk II units and advanced designs.', cost: 700, energy: 400, time: 30, size: 3, hp: 900, armor: 'struct', vision: 36, requires: ['factory'], weapons: [] },
  advtech: { name: 'Advanced Tech Lab', desc: 'Unlocks Mk III units.', cost: 1300, energy: 900, time: 40, size: 3, hp: 1100, armor: 'struct', vision: 36, requires: ['techlab'], weapons: [] },
  turret: { name: 'Gun Turret', desc: 'Defends against ground units.', cost: 300, energy: 120, time: 15, size: 1, hp: 900, armor: 'struct', vision: 52, requires: ['barracks'],
    weapons: [W({ type: 'bullet', range: 40, dmg: 14, reload: 0.35, sec: true }), W({ type: 'ap', range: 46, dmg: 300, reload: 4, kind: 'shell', speed: 90 })] },
  sam: { name: 'SAM Site', desc: 'Radar-guided defense against aircraft, drones and some cruise missiles. Has its own fire-control radar.', radar: { range: 95 }, cost: 350, energy: 200, time: 15, size: 2, hp: 600, armor: 'struct', vision: 60, requires: ['barracks'],
    weapons: [W({ type: 'aa', range: 75, dmg: 380, reload: 3.6, kind: 'missile', speed: 75, ground: false, air: true, radar: true })] },
  radar: { name: 'Ground Radar', desc: 'Long-range air-search radar. Detects aircraft far beyond visual range for your whole team; low flyers are harder to see. Drains energy.', cost: 500, energy: 300, time: 20, size: 2, hp: 600, armor: 'struct', vision: 44, requires: ['factory'], radar: { range: 170 }, upkeep: 5, weapons: [] },
  supplydepot: { name: 'Supply Depot', desc: 'Forward supply base. Rearms ground units in range, tops up Supply Trucks and refuels helicopters. Build one beside an Engineer far from home; stock it by truck or air-dropped pallets.', cost: 400, energy: 100, time: 18, size: 2, hp: 700, armor: 'struct', vision: 44, requires: ['barracks'], depot: { cap: 3000, radius: 30, rate: 44, regen: 1.5 }, weapons: [] },
  ewtower: { name: 'EW Tower', desc: 'Static jammer: degrades enemy drones, aircraft radar and missile locks in a wide area. Drains energy.', cost: 450, energy: 350, time: 18, size: 2, hp: 500, armor: 'struct', vision: 40, requires: ['techlab'], ew: { radius: 62, power: 2 }, upkeep: 6, weapons: [] },
};

// ---- Airfield layout & modules. Local frame: u along the runway (away from the terminal), v toward the apron side.
export const AF = {
  rw0: 14,                 // runway starts this far (u) from the airfield centre
  rwLen: [0, 50, 76, 104], // usable runway length by runway level (1 = base)
  rwHalf: 8,               // half width
  hold: 10,                 // arming / take-off hold point, distance past the threshold
  stands: [0, 2, 4, 6],    // parking & arming stands by apron level
  standU0: 40, standDU: 28, rowV: [24, 52], lane: 38, conn: 12, apV0: 10, apV1: 72, standHalf: 13, apU: [10, 56, 84, 112],
  taxi: 9,                 // taxi speed
  selectTimeout: 60,       // seconds an aircraft waits on the runway for a loadout choice
  maxLevel: 3,
};
export const AF_MODULES = {
  runway: { name: 'Runway', short: 'RWY', levels: [
    { name: 'Long Runway', cost: 550, energy: 200, time: 24, desc: 'Extends the runway to ' + AF.rwLen[2] + ' m. Required for the Heavy Bomber and the Heavy Transport.' },
    { name: 'Heavy Runway', cost: 1000, energy: 400, time: 32, desc: 'Extends the runway to ' + AF.rwLen[3] + ' m. Required for the Strategic Bomber and the heaviest loadouts.' } ] },
  apron: { name: 'Apron & Hangars', short: 'APR', levels: [
    { name: 'Hangar Bay I', cost: 450, energy: 150, time: 20, desc: 'Four aircraft stands (two more) and a hangar.' },
    { name: 'Hangar Bay II', cost: 700, energy: 250, time: 26, desc: 'Six aircraft stands and a second hangar.' } ] },
  depot: { name: 'Munitions Depot', short: 'DEP', levels: [
    { name: 'Depot Level II', cost: 500, energy: 250, time: 22, desc: 'Unlocks level II loadouts. Ground crews work 30% faster.' },
    { name: 'Depot Level III', cost: 900, energy: 500, time: 30, desc: 'Unlocks level III heavy ordnance. Ground crews work 60% faster.' } ] },
};
export const AF_KEYS = Object.keys(AF_MODULES);

export const BUILD_ORDER = ['derrick', 'powerplant', 'barracks', 'factory', 'dronebay', 'airfield', 'techlab', 'advtech', 'turret', 'sam', 'radar', 'ewtower', 'supplydepot'];
// building tiers (derricks and power plants): output / storage multiplier by tier and the upgrade steps
export const BTIER = { mult: [1, 1.9, 3.0], max: 3, steps: { derrick: [{ cost: 300, energy: 0, time: 16 }, { cost: 650, energy: 150, time: 24 }], powerplant: [{ cost: 300, energy: 0, time: 16 }, { cost: 650, energy: 0, time: 24 }] }, roman: ['', 'I', 'II', 'III'] };
export const PRODUCER_KINDS = ['hq', 'barracks', 'factory', 'airfield', 'dronebay'];
export const STORAGE_BASE = { m: 0, e: 0 };

for (const [k, d] of Object.entries(BUILDINGS)) {
  d.id = k; d.base = k; d.tier = 1; d.kind = 'building'; d.radius = d.size * CELL * 0.5; d.income = d.income || 0; d.incomeE = d.incomeE || 0; d.requires = d.requires || [];
  d.maxRange = 0; d.hitsGround = false; d.hitsAir = false;
  for (const w of d.weapons) { d.maxRange = Math.max(d.maxRange, w.range); d.hitsGround = d.hitsGround || w.ground; d.hitsAir = d.hitsAir || w.air; w.reloadTicks = Math.max(1, Math.round(w.reload * TICK_RATE)); }
  d.hasSec = d.weapons.some((w) => w.sec); d.secRange = d.weapons.reduce((m, w) => (w.sec ? Math.max(m, w.range) : m), 0);
}
export const DEFS = Object.assign({}, UNITS, BUILDINGS);
