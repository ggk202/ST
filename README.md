# SPEARHEAD

A 3D, near-future real-time strategy game that runs entirely in the browser (desktop and iPad).
Pure HTML + JavaScript modules, [three.js](https://threejs.org) for 3D, and WebRTC (PeerJS) for multiplayer.
No build step and no server of your own.

- Single player (1–3 AI opponents) or 2–4 player multiplayer
- Procedural maps: **islands** (ocean border) and **mountain valleys** (mountain-ring border), three sizes
- Combined arms: infantry, light/medium/heavy armor, IFVs, artillery, rocket artillery, ballistic missiles, helicopters, VTOL fighters, UAVs, anti-air, and defensive structures
- Fog of war, oil-derrick economy, tech tree
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
| B / I / V / Y, Tab | Structures / Infantry / Vehicles / Aircraft tab |
| 1–9, Shift+1–9 (or Ctrl/⌘) | Recall / assign control group |
| Ctrl/⌘+A, H, Space, Esc | Select army, jump to HQ, jump to last alert, cancel/menu |

## Tips

- You are eliminated when you have lost your Command Center *and* all production buildings (Barracks, War Factory, Airfield).
- Income comes from the Command Center and **Oil Derricks** on the dark oil fields. Train an **Engineer** to build on oil fields away from your base.
- Barracks → War Factory → Tech Lab / Airfield. The Tech Lab unlocks heavy tanks, rocket artillery, ballistic missiles and VTOLs.
- Artillery and missiles need vision of the target: bring scouts, helicopters or a UAV.
- Anti-air (MANPADS, Mobile AA, SAM Site) counters aircraft; AT teams and IFV missiles counter armor.

## Project layout

```
index.html          UI shell and styles
js/main.js          menus, lobby, match start/stop
js/game.js          one match: lockstep pacing, render loop
js/net.js           PeerJS transport + lockstep turn system
js/render.js        three.js scene, terrain, fog of war, picking
js/models.js        procedural unit/building models
js/fx.js            particles, tracers, procedural sound
js/input.js         mouse / touch / keyboard + orders
js/ui.js            HUD, minimap, build menu
js/sim/             deterministic simulation (no DOM / three.js)
  defs.js map.js path.js sim.js ai.js util.js
tests/sim-test.mjs  headless AI-vs-AI, determinism and map-connectivity test
```

Run the simulation test with `node tests/sim-test.mjs`.

The simulation only uses `+ − × ÷ sqrt` (no `sin`/`cos`/`pow`), a seeded PRNG and ordered iteration so every browser computes identical results.
