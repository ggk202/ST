// Procedural animation: two-bone IK walking with terrain-aware foot placement for the larger legged machines, plus
// spring-based body motion (pitch from acceleration, roll from turning, gun-fire kick, turbulence) for everything else.
// Render-side only (never touches the deterministic sim).
const PI = Math.PI, clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; };

// Gait tuning per model. S: stride length, lift: swing foot height, beta: fraction of the cycle spent on the ground,
// bob: body bounce, legs: phase offset per leg (diagonal pairs for quadrupeds, alternating for bipeds).
export const GAIT = {
  robot: { S: 0.95, lift: 0.34, beta: 0.6, bob: 0.07, twist: 0.05, legs: { legL: 0, legR: 0.5 } },
  ewdog: { S: 0.65, lift: 0.3, beta: 0.5, bob: 0.05, twist: 0.0, legs: { legFL: 0, legBR: 0, legFR: 0.5, legBL: 0.5 } },
  walker: { S: 1.8, lift: 0.75, beta: 0.62, bob: 0.2, twist: 0.045, legs: { legL: 0, legR: 0.5 } },
};

// Body spring parameters per movement class: [stiffness, damping, pitch-per-accel, roll-per-turn, fire kick]
const SPRING = { K: 70, C: 8.5 };

export function prep(ch) {
  const [hy, hz] = ch.hip, [ky, kz] = ch.knee, [ay, az] = ch.ankle;
  const a1 = Math.atan2(kz - hz, ky - hy), a2 = Math.atan2(az - kz, ay - ky), phi = Math.atan2(az - hz, ay - hy);
  return { hy, hz, ay, az, L1: Math.hypot(ky - hy, kz - hz), L2: Math.hypot(ay - ky, az - kz), a1, a2, bend: wrap(a1 - phi) >= 0 ? 1 : -1 };
}

// Solve a two-bone leg in the (y, z) plane so the ankle reaches (ty, tz) with the foot pitched by `pitch`.
// Joint rotations are written to the three nested meshes (hip / shin / foot).
export function solve(P, tz, ty, pitch, thigh, shin, foot) {
  let dy = ty - P.hy, dz = tz - P.hz, D = Math.hypot(dy, dz);
  const mn = Math.abs(P.L1 - P.L2) + 0.03, mx = P.L1 + P.L2 - 0.02;
  if (D > mx) { const k = mx / D; dy *= k; dz *= k; D = mx; } else if (D < mn) { const k = mn / Math.max(D, 1e-4); dy *= k; dz *= k; D = mn; }
  const al = Math.acos(clamp((P.L1 * P.L1 + D * D - P.L2 * P.L2) / (2 * P.L1 * D), -1, 1));
  const a1 = Math.atan2(dz, dy) + P.bend * al;
  const ky = P.hy + P.L1 * Math.cos(a1), kz = P.hz + P.L1 * Math.sin(a1);
  const a2 = Math.atan2(P.hz + dz - kz, P.hy + dy - ky);
  const r1 = wrap(a1 - P.a1), r2 = wrap(a2 - P.a2 - r1);
  thigh.rotation.x = r1; shin.rotation.x = r2; foot.rotation.x = pitch - r1 - r2;
}

export const hasIK = (v, base) => !!(GAIT[base] && v.chains && v.chains[Object.keys(GAIT[base].legs)[0]] && v.parts[Object.keys(GAIT[base].legs)[0] + '.shin']);

// ground(x, z) returns terrain height, or null to skip terrain adaptation (distant LOD).
export function animateLegsIK(v, an, base, dt, speed, ground) {
  const g = GAIT[base], m = v.parts;
  if (!an.ik) { an.ik = {}; for (const n in g.legs) an.ik[n] = prep(v.chains[n]); an.gp = 0; }
  an.gp = (an.gp + dt * Math.min(speed, 14) * g.beta / g.S) % 1;
  const k = an.leg;                                                             // 0 standing .. 1 walking
  const first = an.ik[Object.keys(g.legs)[0]];
  const p0 = (an.gp + 1 - g.beta / 2) % 1;
  let bob = g.bob * k * (0.5 + 0.5 * Math.cos(4 * PI * p0));
  let ux = 0, uz = 0, gy0 = 0, sy = 0, cy = 1;
  if (ground) { ux = v.obj.position.x; uz = v.obj.position.z; gy0 = ground(ux, uz); sy = Math.sin(v.yaw); cy = Math.cos(v.yaw); }
  const L = [];                                                                 // pass 1: gait targets and terrain under each foot
  let need = 0;
  for (const n in g.legs) {
    const P = an.ik[n], p = (an.gp + g.legs[n]) % 1;
    let dz, dy = 0, pitch = 0;
    if (p < g.beta) { const t = p / g.beta; dz = g.S * (0.5 - t); }
    else { const t = (p - g.beta) / (1 - g.beta), s = t * t * (3 - 2 * t); dz = g.S * (-0.5 + s); dy = g.lift * Math.sin(PI * t); pitch = -0.4 * Math.sin(PI * t); }
    dz *= k; dy *= k; pitch *= k;
    let gy = 0, drop = 0;
    if (ground) {
      const lx = m[n].position.x, fz = P.az + dz;                              // foot position in hull space -> world
      const wx = ux + cy * lx + sy * fz, wz = uz - sy * lx + cy * fz;
      gy = ground(wx, wz) - gy0;
      drop = P.L1 + P.L2 - 0.02 - Math.hypot(P.ay + dy - bob - P.hy, P.az + dz - P.hz);   // how far this leg can still reach down
      if (dy < 0.01 && gy < -drop) need = Math.max(need, -gy - drop);
    }
    L.push({ n, P, dz, dy, pitch, gy, drop });
  }
  an.hd = (an.hd || 0) + (clamp(need, 0, 0.4) - (an.hd || 0)) * Math.min(1, dt * 10);   // sink the body so planted feet can still touch lower ground
  bob -= an.hd;
  for (const l of L) {
    const { n, P } = l, thigh = m[n], shin = m[n + '.shin'], foot = m[n + '.shin.foot'];
    const gy = ground ? clamp(l.gy, -Math.max(l.drop + an.hd, 0) * 0.97, 0.45) : 0;
    thigh.position.y = v.rp[n][1] + bob;
    solve(P, P.az + l.dz, P.ay + l.dy + gy - bob, l.pitch, thigh, shin, foot);
  }
  v.hull.position.y = bob; v.hull.rotation.y = Math.sin(an.gp * 2 * PI) * g.twist * k; v.hull.rotation.z = 0;
  for (const kk in m) if (!kk.includes('.') && !g.legs[kk]) { m[kk].position.y = (v.rp[kk] ? v.rp[kk][1] : 0) + bob; }
}

// Spring-damped body motion. Vehicles and walkers pitch with acceleration, roll in turns and kick when they fire;
// aircraft get gentle turbulence.
export function animateBody(v, e, d, dt, speed, time, firing) {
  const an = v.an, o = v.obj;
  if (d.air) {
    const hv = e.h === undefined ? 1 : e.h, t = time + e.id * 1.7, amp = (d.base === 'fpv' ? 0.05 : 0.025) * hv;
    o.rotation.z += Math.sin(t * 1.3) * amp + Math.sin(t * 2.9) * amp * 0.4; o.rotation.x += Math.sin(t * 0.9 + 1) * amp * 0.7;
    return;
  }
  if (e.armor === 'inf' && !d.drone) return;                                   // infantry: no body physics
  const h = Math.min(dt, 0.05) || 0.016;
  if (!an.sp) an.sp = { p: 0, pv: 0, r: 0, rv: 0, ls: speed, ly: v.yaw, fire: false };
  const s = an.sp;
  const acc = clamp((speed - s.ls) / h, -40, 40); s.ls = speed;
  let dyaw = wrap(v.yaw - s.ly); s.ly = v.yaw; const yr = clamp(dyaw / h, -4, 4);
  const mass = clamp(1.7 / Math.max(d.radius, 0.8), 0.35, 1.2);                   // heavy things move less
  const pT = clamp(-acc * 0.0035, -0.07, 0.07) * mass, rT = clamp(-yr * speed * 0.0022, -0.08, 0.08) * mass;
  if (firing && !s.fire && d.weapons && d.weapons.length && d.radius > 1.4) s.pv -= 0.55 * mass;   // gun kick
  s.fire = firing;
  s.pv += (SPRING.K * (pT - s.p) - SPRING.C * s.pv) * h; s.p += s.pv * h;
  s.rv += (SPRING.K * (rT - s.r) - SPRING.C * s.rv) * h; s.r += s.rv * h;
  o.rotation.x = (e.armor === 'inf' ? 0 : o.rotation.x) + s.p; o.rotation.z = s.r;
  if (speed > 0.5 && d.radius > 1.4) o.position.y += (Math.sin(time * 17 + e.id) * 0.018 + Math.sin(time * 7.3 + e.id * 2) * 0.02) * Math.min(speed / 6, 1);   // road / ground chatter
}
