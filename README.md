# SPEARHEAD

A 3D, near-future real-time strategy game that runs entirely in the browser (desktop and iPad).
Pure HTML + JavaScript modules, [three.js](https://threejs.org) for 3D, and WebRTC (PeerJS) for multiplayer.
No build step and no server of your own.

- Single player (1–3 AI opponents) or 2–4 player multiplayer
- Procedural maps: **islands** (ocean border) and **mountain valleys** (mountain-ring border), three sizes
- Combined arms: infantry, light/medium/heavy armor, IFVs, artillery, rocket artillery, ballistic missiles, helicopters, VTOL fighters, UAVs, anti-air, and defensive structures
- **Drones**: combat robots, **EW dogs** (escort infantry, fry enemy drones with a high-power-microwave emitter), crawler bombs, repair bots, assault walkers, FPV swarms, jet wingmen, **deep-strike one-way carriers** and **EMP carriers**
- **Electronic warfare**: EW trucks, EW aircraft, EW towers and EW dogs jam enemy drones (slower, less accurate, control loss at Mk III jamming), blind aircraft radar (shorter vision, shorter radar-missile range) and break missile locks. Jammers drain energy
- **Three tiers per unit (Mk I / II / III)** - Tech Lab unlocks Mk II, the Advanced Tech Lab unlocks Mk III
- **Tier equipment & looks**: higher tiers carry more kit *and* look the part. Mk II vehicles add IRCM flare/smoke launchers (30% chance to decoy a missile), add-on armor, thermal sights and gold markings; Mk III vehicles add composite appliqué, a personal EW suite (jams drones and covers friendly aircraft nearby), better IRCM (45%) and glowing cyan sensors. Mk II aircraft get chaff/flare dispensers; Mk III aircraft add a directed-energy turret that burns inbound missiles (~70% per shot, 50-tick recharge) plus conformal EW arrays. Higher-tier infantry get plates, night-vision visors and extended vision; Mk III ground drones resist jamming. Every unit's tooltip lists its kit.
- **Streaming economy** (like *Planetary Annihilation*): metal and energy flow continuously into whatever you are building. If supply can't keep up, everything slows down proportionally. Oil Derricks make metal, Power Plants make energy
- Fog of war, tech tree
- Highly detailed procedural models (15k–26k vertices per tank): bolted armour, ERA, side skirts, crew hatches, remote weapon stations, APS radar panels, smoke launchers, antennae, sights and stowage on vehicles; kitted-out infantry; detailed aircraft, drones and buildings. Zoom in close to see them.
- Procedural shaders and textures, wind-swept grass / trees / rocks, drifting clouds with ground shadows, animated water, walk cycles, tracks and wheels, turret recoil, banking aircraft (Settings ▸ Graphics: High / Medium / Classic)
- Touch controls for iPad plus full mouse and keyboard support

## Play it from GitHub

GitHub only shows HTML as text when you open the file directly, so turn on **GitHub Pages**:

1. Repository **Settings → Pages**
2. *Build and deployment*: **Deploy from a branch**, branch **main**, folder **/ (root)**
3. After a minute the game is live at `https://<your-user>.github.io/ST/`

Pages is served over HTTPS, which multiplayer (WebRTC) needs.
The game loads three.js and PeerJS from public CDNs, so the device needs internet access.

You can also run it locally (ES modules do not work from `file://`):

```
python3 -m http.server 8000     # then open http://localhost:8000
```

## Multiplayer

1. One player picks **Multiplayer – Host Game** and shares the 5-character room code.
2. Others pick **Join Game** and enter the code. The host configures slots (open player slot, AI, closed), teams, map type, size and seed, then presses **Start**.
3. If a player disconnects mid-game, an AI takes over their forces.

How it works: the simulation is fully deterministic and every client runs it. Only player commands travel over the network
(host-relayed lockstep, 10 turns per second). The host periodically compares state hashes and shows a warning if the games ever diverge.
PeerJS's free public broker is used only for the initial handshake; game traffic is peer-to-peer.
Very strict corporate/school networks (symmetric NAT) can block WebRTC; a TURN server would be needed there.

## Controls

**Touch (iPad):** tap to select; tap ground/enemy to move/attack; drag to pan; pinch to zoom; twist to rotate;
long-press then drag (or the BOX button) to box-select; double-tap a unit to select all of its type on screen.
Use the Move / Attack-Move / Stop / Fire-at-ground buttons. To build: choose a structure, tap the map, press ✔.

**Mouse / keyboard (also iPad with Magic Keyboard):**

| Input | Action |
|-------|--------|
| Left click / drag | Select / box-select (Shift adds) |
| Right click | Move / attack / set rally point |
| Right- or middle-drag, Q / E | Rotate camera |
| Arrow keys (W A S D when nothing is selected, or with Shift), screen edge | Pan |
| Wheel, + / −, Z / X | Zoom |
| A / M / S / F | Attack-move / Move / Stop / Fire at ground |
| T / J / U (transport selected) | Airlift / Airdrop / Unload |
| O | Sensor overlay (radars, jammers, radar contacts) |
| B / I / V / Y / D, Tab | Structures / Infantry / Vehicles / Aircraft / Drones tab |
| T | Cycle unit tier (Mk I / II / III) in the build panel |
| 1–9, Shift+1–9 (or Ctrl/⌘) | Recall / assign control group |
| Ctrl/⌘+A, H, Space, Esc | Select army, jump to HQ, jump to last alert, cancel/menu |

## Tips

- You are eliminated when you have lost your Command Center *and* all production buildings (Barracks, War Factory, Drone Bay, Airfield).
- **Metal** comes from the Command Center and **Oil Derricks** on the dark oil fields (train an **Engineer** to build on distant fields). **Energy** comes from **Power Plants**. Production and construction drain both continuously - watch the "Build speed" indicator in the top bar; if it drops, build more derricks / power plants. Cancelling refunds what has been spent.
- Barracks → War Factory → Drone Bay / Tech Lab / Airfield. The Tech Lab unlocks Mk II units, heavy tanks, rocket artillery, ballistic missiles, VTOLs, EW vehicles, deep-strike drones and the EW Tower. The Advanced Tech Lab unlocks Mk III and EMP carriers.
- **Drones are cheap but fragile to electronic warfare.** An EW dog's HPM emitter kills drones outright but barely scratches armor; flak (Mobile AA, SAM) and jammers also shut down swarms. Jam enemy aircraft to blind their radar missiles; keep a jammer over your own aircraft to make incoming missiles lose lock.
- Deep-strike carriers and crawler bombs are one-way: select them and use *Fire at ground* (F) or right-click an enemy structure. EMP carriers stun everything in the blast (vehicles, drones, structures).
- Artillery and missiles need vision of the target: bring scouts, helicopters or a UAV.
- Anti-air (MANPADS, Mobile AA, SAM Site) counters aircraft; AT teams and IFV missiles counter armor.

## Project layout

```
index.html          UI shell and styles
js/main.js          menus, lobby, match start/stop
js/game.js          one match: lockstep pacing, render loop
js/net.js           PeerJS transport + lockstep turn system
js/render.js        three.js scene, terrain, fog of war, picking, entity views
js/gfx.js           procedural textures, shader patches, sky/clouds, ground scatter, animation
js/models.js        model assembly + materials
js/model-core.js    Builder + detail helpers (bolts, hatches, antennae, RCWS, APS, ERA, tracks ...)
js/model-ground.js  infantry + vehicle models
js/model-air.js     aircraft models
js/model-drones.js  robots, walkers, FPV, jet drones, carriers
js/model-buildings.js  structures
js/fx.js            particles, tracers, procedural sound
js/input.js         mouse / touch / keyboard + orders
js/ui.js            HUD, minimap, build menu
js/sim/             deterministic simulation (no DOM / three.js)
  defs.js map.js path.js sim.js ai.js util.js flight.js airops.js cargo.js
tests/sim-test.mjs  headless AI-vs-AI, determinism and map-connectivity test
tests/mech-test.mjs drones / EW / EMP / tiers / streaming-economy mechanics test
tests/air-test.mjs  airfields, loadouts and sorties
tests/cargo-test.mjs transport, airlift, airdrop, engineer boost
tests/radar-test.mjs radar / ECM / APS / SAM vs cruise missiles / spy drone / building tiers
tests/tier-test.mjs tier equipment: IRCM decoys, directed-energy defense, personal EW, jam resistance
```

Run the simulation tests with `node tests/sim-test.mjs` and `node tests/mech-test.mjs`.

The simulation only uses `+ − × ÷ sqrt` (no `sin`/`cos`/`pow`), a seeded PRNG and ordered iteration so every browser computes identical results.

## Procedural animation, LOD and iPad performance

All of this is render-side only; the deterministic sim is untouched, so lockstep multiplayer is unaffected.

- **Procedural animation** (`js/procanim.js`): the Combat Robot, EW Dog and Walker have hierarchical legs (thigh → shin → foot) driven by two-bone IK with a stance/swing gait. Planted feet stay fixed in the world, feet follow terrain height, and the body sinks when the ground is out of reach. Vehicles and aircraft get spring-damper pitch/roll from acceleration and turning, gun-kick on firing, road chatter and aircraft turbulence.
- **LOD**: every model is built at 3 detail levels (small parts dropped, primitives simplified; roughly 75k vs 327k vertices for the full roster at LOD2 vs LOD0). Distance-based with hysteresis, frustum culling, and animation skipped off-screen and throttled at LOD2.
- **iPad**: pixel ratio capped at 1.5, 1024 shadow map, tighter LOD distances, and an adaptive-resolution governor that steps render scale down/up from frame time.
- **Settings**: *Model detail* (Auto / Max) and *Adaptive resolution* (On / Off).

## Airfields, loadouts and ground ops

Aircraft run a full sortie cycle: **built → taxi to the runway (only if it is free and nobody is landing) → pick a loadout → ground crew arms it → take off → fly → return to base when out of ammo → land → taxi in → rearm**. Helicopters and VTOLs skip the runway and are armed on their stand.

- **Loadouts**: every aircraft has role-based loadouts (cost, energy, prep time, ammo, stat mods). You have 60 s to choose on the runway, otherwise the last/standard loadout is used. The AI and airfields with *auto-arm* pick instantly. Heavy loadouts need a longer runway and a higher depot level.
- **Modular airfield**: select an airfield to extend it with a *Long/Heavy Runway* (50 → 76 → 104 m), *Hangar Bays* (2 → 4 → 6 large stands, 26 m each) and *Depot* levels (faster crews, heavier stores). Extensions are limited by the terrain; the placement ghost previews runway and apron.
- **New aircraft**: Fighter (air superiority / strike), Heavy Bomber (needs the Long Runway), **Strategic Bomber** (Heavy Runway; 10 × 1 t bombs, area saturation, 10 t *Mega Bomb*, long-range cruise salvo) and the **Heavy Transport** (Long Runway).
- **Arming dialog**: the loadout picker only opens when you click a parked / waiting aircraft (or press `L`), never on its own.
- **Hotkeys**: `H` return to base, `L` open the loadout picker.
- **Tests**: `node tests/air-test.mjs` covers layout, upgrades, the full sortie cycle, runway locking, bingo/RTB, loadout locks, AI, selling and determinism.

## Air transport: airlift and airdrop

- Build a **Heavy Transport**. It waits on its stand (no runway needed) until you pick a configuration: *Mixed Cargo* (40 slots), *Troop Carrier* (80 slots, infantry / drones / light vehicles only) or *Vehicle Hauler* (60 slots, Heavy Runway).
- **Load**: select ground units and right-click the parked transport. Infantry and drones take 1 slot, light vehicles 2, tanks 3–5, big launchers 4+.
- **Airlift**: select the loaded transport, press `T` (or *Airlift…*) and click another of your airfields (its runway must be long enough). The transport flies, lands, taxis to a stand and unloads there, and is re-homed at the destination.
- **Airdrop**: press `J` (or *Airdrop…*) and click a drop zone. Parachute-capable units (infantry, drones and light vehicles) are dropped around the point and descend under canopies for a few seconds, heavier cargo stays aboard. The transport then returns to the nearest suitable airfield.
- `U` unloads a parked transport. Cargo is lost if the transport is shot down.

## Economy and production

Units are about a third cheaper and build twice as fast; income, oil, power and storage are roughly doubled and the unit cap is 320. **Engineers speed buildings up**: every engineer standing next to a structure adds +50 % (up to 6) to construction, unit production, airfield upgrades and the resources it draws.

## Maps, combat and graphics (recent)

Maps are four times larger with open ground; oil derricks are always visible (world beacons + minimap). Damage is more realistic (a guided anti-tank missile can kill a tank in one or two hits), aircraft fly with real turn radii, stall speeds, runway approaches and go-arounds. Tanks carry a top MG and coax that fire at infantry while the main gun engages armor, and have limited-ammo APS. Graphics: modelled projectiles, explosion lighting, bomb craters, vehicle dust trails, afterburners, contrails and rotor wash.

Tests: `node tests/cargo-test.mjs` covers the transport, boarding, airlift, airdrop, the strategic bomber gate and the engineer boost.

## Radar, electronic warfare and the sensor overlay

- **Radar emitters**: *Ground Radar* (170 m air search), *AWACS* (200 m, airborne), SAM sites (95), Mobile AA (65), and fighters / VTOLs (forward 120° cone, 85 / 60). Radar needs energy, parked aircraft don't emit.
- **Detection** uses the radar equation: range scales with the fourth root of the target's radar cross-section (large transports and bombers are seen from further away, UAVs and helicopters from much closer, the stealth drone barely at all). Low flyers are partly masked from ground radars. Everything your team's radars hold is shared as a *contact*; SAMs and radar/missile weapons can fire on contacts, guns still need visual range.
- **Jamming**: enemy EW over a radar shrinks its range; EW covering the target (escort jammers) shrinks the detection range of enemy radars; inside the *burn-through* range (30 %) the radar always wins.
- **Stealth Spy Drone** (Long Runway): ultra-high-altitude, huge vision, out of reach of every weapon, so it **cannot be shot down**. Only jammers blind it (EW towers, trucks, aircraft, with double reach against it).
- **AWACS** large radar plane with a rotating dome; shares the air picture and lets SAMs and fighters engage beyond visual range.
- **Sensor overlay** (`O` or the SENSORS button): shows your radar and jammer coverage (jammed radars show their reduced and nominal range), forward-looking aircraft radar search cones with a sweeping beam, enemy emitters you can see, radar contacts as unidentified *BOGEY* blips with speed and size class, and which of your aircraft are being jammed.
- **APS** now hard-kills guided anti-tank missiles, unguided rockets and attacking drones (not kinetic tank rounds, bombs, artillery or cruise missiles). **SAM sites and AA vehicles can intercept some cruise missiles.**
- **Tiered derricks and power plants**: select one and press *Upgrade* for Mk II (×1.9 output and storage) and Mk III (×3).
- **Huge map** size (560 × 560) in the lobby. Unexplored terrain is now much brighter.
