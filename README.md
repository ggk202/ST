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
  defs.js map.js path.js sim.js ai.js util.js
tests/sim-test.mjs  headless AI-vs-AI, determinism and map-connectivity test
tests/mech-test.mjs drones / EW / EMP / tiers / streaming-economy mechanics test
```

Run the simulation tests with `node tests/sim-test.mjs` and `node tests/mech-test.mjs`.

The simulation only uses `+ − × ÷ sqrt` (no `sin`/`cos`/`pow`), a seeded PRNG and ordered iteration so every browser computes identical results.

## Procedural animation, LOD and iPad performance

All of this is render-side only; the deterministic sim is untouched, so lockstep multiplayer is unaffected.

- **Procedural animation** (`js/procanim.js`): the Combat Robot, EW Dog and Walker have hierarchical legs (thigh → shin → foot) driven by two-bone IK with a stance/swing gait. Planted feet stay fixed in the world, feet follow terrain height, and the body sinks when the ground is out of reach. Vehicles and aircraft get spring-damper pitch/roll from acceleration and turning, gun-kick on firing, road chatter and aircraft turbulence.
- **LOD**: every model is built at 3 detail levels (small parts dropped, primitives simplified; roughly 75k vs 327k vertices for the full roster at LOD2 vs LOD0). Distance-based with hysteresis, frustum culling, and animation skipped off-screen and throttled at LOD2.
- **iPad**: pixel ratio capped at 1.5, 1024 shadow map, tighter LOD distances, and an adaptive-resolution governor that steps render scale down/up from frame time.
- **Settings**: *Model detail* (Auto / Max) and *Adaptive resolution* (On / Off).
