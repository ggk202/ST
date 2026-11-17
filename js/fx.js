// Particle effects, tracers and procedural sound.
import * as THREE from 'three';

const VERT = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = max(1.0, aSize * uScale / max(0.1, -mv.z)); gl_Position = projectionMatrix * mv; }`;
const FRAG = `
varying vec4 vColor;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d) * vColor.a; gl_FragColor = vec4(vColor.rgb, a); }`;

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0; this.next = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.base = new Float32Array(max * 4); this.size0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aCol = new THREE.BufferAttribute(this.col, 4); this.aSize = new THREE.BufferAttribute(this.size, 1);
    this.aPos.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage); this.aSize.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol); g.setAttribute('aSize', this.aSize);
    this.uniforms = { uScale: { value: 600 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grow = 0, drag = 0, grav = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.size0[i] = size;
    this.base[i * 4] = r; this.base[i * 4 + 1] = g; this.base[i * 4 + 2] = b; this.base[i * 4 + 3] = a;
    this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt, scale) {
    this.uniforms.uScale.value = scale;
    const { pos, vel, col, size, life, maxLife, base, grow, drag, grav, size0 } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { size[i] = 0; col[i * 4 + 3] = 0; continue; }
      life[i] -= dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - grav[i] * dt; vel[i * 3 + 2] *= dr;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = size0[i] + grow[i] * (1 - t);
      col[i * 4] = base[i * 4]; col[i * 4 + 1] = base[i * 4 + 1]; col[i * 4 + 2] = base[i * 4 + 2]; col[i * 4 + 3] = base[i * 4 + 3] * t;
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

export class Fx {
  constructor(scene) {
    this.fire = new Particles(scene, 2500, true);
    this.smoke = new Particles(scene, 3500, false);
    this.tracers = [];
    const max = 400;
    this.tpos = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    this.tAttr = new THREE.BufferAttribute(this.tpos, 3); this.tAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.tAttr); g.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 6;
    scene.add(this.lines);
    this.burners = [];
    this.maxTracers = max;
  }
  rnd(a) { return (Math.random() - 0.5) * 2 * a; }
  muzzle(x, y, z, size = 1) {
    this.fire.emit(x, y, z, 0, 0, 0, 0.09, size * 1.6, 1, 0.85, 0.4, 1, 0, 0);
    this.smoke.emit(x, y, z, this.rnd(0.5), 0.8, this.rnd(0.5), 0.6, size * 0.8, 0.75, 0.75, 0.75, 0.35, size * 1.2, 1);
  }
  spark(x, y, z) { for (let i = 0; i < 3; i++) this.fire.emit(x, y, z, this.rnd(5), Math.random() * 4, this.rnd(5), 0.25, 0.35, 1, 0.8, 0.35, 1, 0, 1, 12); }
  tracer(x, y, z, tx, ty, tz) {
    if (this.tracers.length >= this.maxTracers) this.tracers.shift();
    this.tracers.push({ x, y, z, tx, ty, tz, t: 0, d: 0.12 });
  }
  boom(x, y, z, r, big, air) {
    const n = Math.min(70, Math.round(8 + r * (big ? 4 : 3)));
    const s = Math.max(1.2, r * 0.9);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = (0.3 + Math.random()) * r * (big ? 2.4 : 1.6), up = Math.random() * r * 1.4;
      this.fire.emit(x, y + 0.5, z, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.3 + Math.random() * (big ? 1.0 : 0.5), s * (0.8 + Math.random()), 1, 0.45 + Math.random() * 0.4, 0.12, 0.95, s * 0.6, 2.5);
    }
    const sn = Math.min(40, Math.round(4 + r * 2));
    for (let i = 0; i < sn; i++) {
      const a = Math.random() * 6.283, sp = Math.random() * r * 0.8;
      const gr = 0.18 + Math.random() * 0.2;
      this.smoke.emit(x, y + 1, z, Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, 1.4 + Math.random() * (big ? 3 : 1.5), s * 1.2, gr, gr, gr, 0.55, s * 2.2, 0.8);
    }
    if (!air) for (let i = 0; i < Math.min(14, 4 + r); i++) { const a = Math.random() * 6.283; this.smoke.emit(x, y + 0.3, z, Math.cos(a) * r * 1.2, 0.4, Math.sin(a) * r * 1.2, 1.2, s * 0.9, 0.5, 0.42, 0.3, 0.4, s * 1.4, 1.5); }
    for (let i = 0; i < 6; i++) this.fire.emit(x, y, z, this.rnd(r * 2), 3 + Math.random() * r * 2, this.rnd(r * 2), 0.5, 0.3, 1, 0.8, 0.3, 1, 0, 0.5, 14);
  }
  // electric blue sparks along a line (HPM emitters)
  zap(x, y, z, tx, ty, tz) {
    for (let i = 0; i < 5; i++) { const t = Math.random(), j = 0.6; this.fire.emit(x + (tx - x) * t + this.rnd(j), y + (ty - y) * t + this.rnd(j), z + (tz - z) * t + this.rnd(j), this.rnd(2), this.rnd(2), this.rnd(2), 0.14, 0.5, 0.35, 0.8, 1, 1, 0, 0); }
    this.fire.emit(tx, ty, tz, 0, 0, 0, 0.12, 1.4, 0.4, 0.8, 1, 1, 1.2, 0);
  }
  // EMP burst: expanding ring of electric sparks
  emp(x, y, z, r) {
    for (let i = 0; i < 70; i++) { const a = i / 70 * 6.283, sp = r * 1.6; this.fire.emit(x, y + 0.5, z, Math.cos(a) * sp, this.rnd(1.5), Math.sin(a) * sp, 0.6, 0.9, 0.35, 0.75, 1, 1, 0.5, 1.2); }
    for (let i = 0; i < 30; i++) this.fire.emit(x + this.rnd(r * 0.5), y + 1 + Math.random() * 2, z + this.rnd(r * 0.5), this.rnd(6), Math.random() * 6, this.rnd(6), 0.5, 0.6, 0.7, 0.9, 1, 1, 0, 1, 8);
    this.fire.emit(x, y + 1, z, 0, 0, 0, 0.35, 3, 0.7, 0.9, 1, 1, r * 1.4, 0);
  }
  burn(x, y, z, secs) { this.burners.push({ x, y, z, t: secs, c: 0 }); }
  trail(x, y, z, big) {
    this.smoke.emit(x, y, z, this.rnd(0.4), 0.2, this.rnd(0.4), big ? 2.5 : 0.9, big ? 2.2 : 0.7, 0.85, 0.85, 0.85, 0.5, big ? 3 : 1.2, 0.5);
    this.fire.emit(x, y, z, 0, 0, 0, 0.08, big ? 2.2 : 0.7, 1, 0.7, 0.3, 1, 0, 0);
  }
  update(dt, scale) {
    for (let i = this.burners.length - 1; i >= 0; i--) {
      const b = this.burners[i]; b.t -= dt; b.c -= dt;
      if (b.c <= 0) { b.c = 0.08; this.smoke.emit(b.x + this.rnd(0.6), b.y + 1, b.z + this.rnd(0.6), this.rnd(0.3), 2.5, this.rnd(0.3), 2.2, 1.6, 0.1, 0.1, 0.1, 0.6, 3, 0.2); if (Math.random() < 0.3) this.fire.emit(b.x + this.rnd(0.5), b.y + 0.6, b.z + this.rnd(0.5), 0, 1.5, 0, 0.35, 1.2, 1, 0.5, 0.15, 0.9, 0, 0); }
      if (b.t <= 0) this.burners.splice(i, 1);
    }
    this.fire.update(dt, scale); this.smoke.update(dt, scale);
    let k = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.t += dt;
      if (t.t >= t.d) { this.tracers.splice(i, 1); continue; }
    }
    for (const t of this.tracers) {
      const p0 = Math.max(0, t.t / t.d - 0.25), p1 = Math.min(1, t.t / t.d + 0.25);
      this.tpos[k++] = t.x + (t.tx - t.x) * p0; this.tpos[k++] = t.y + (t.ty - t.y) * p0; this.tpos[k++] = t.z + (t.tz - t.z) * p0;
      this.tpos[k++] = t.x + (t.tx - t.x) * p1; this.tpos[k++] = t.y + (t.ty - t.y) * p1; this.tpos[k++] = t.z + (t.tz - t.z) * p1;
    }
    this.lines.geometry.setDrawRange(0, k / 3); this.tAttr.needsUpdate = true;
  }
}

// ---------- audio ----------
let ctx = null, master = null, noiseBuf = null, lastPlay = 0, budget = 0;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function setVolume(v) { if (master) master.gain.value = v; }
export function sfx(kind, vol = 1) {
  if (!ctx || ctx.state !== 'running' || vol < 0.02) return;
  const now = ctx.currentTime;
  if (now - lastPlay > 0.1) { lastPlay = now; budget = 0; }
  if (++budget > 6) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  let dur = 0.1, freq = 2500, type = 'bandpass', q = 0.8, v = 0.25;
  switch (kind) {
    case 'rifle': dur = 0.07; freq = 2600; v = 0.2; break;
    case 'cannon': dur = 0.35; freq = 500; type = 'lowpass'; v = 0.7; break;
    case 'missile': dur = 0.6; freq = 1400; q = 0.5; v = 0.3; break;
    case 'boom': dur = 0.7; freq = 380; type = 'lowpass'; v = 0.8; break;
    case 'big': dur = 2.0; freq = 220; type = 'lowpass'; v = 1.2; break;
    case 'ui': dur = 0.05; freq = 1800; v = 0.15; break;
    default: break;
  }
  f.type = type; f.frequency.setValueAtTime(freq, now); if (type === 'lowpass') f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), now + dur); f.Q.value = q;
  g.gain.setValueAtTime(v * vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(now, Math.random()); src.stop(now + dur + 0.05);
}
