// Multiplayer: WebRTC peer-to-peer via PeerJS (public broker for the handshake only).
// Lockstep model: every peer runs the same deterministic simulation; the host collects
// commands, groups them into numbered turns and relays them to everybody.
import { TICK_RATE } from './sim/defs.js';

export const TURN_TICKS = 2;               // sim ticks per network turn (100 ms)
const PREFIX = 'spearhead-rts-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALLOWED = new Set(['move', 'attackmove', 'attackground', 'attack', 'stop', 'build', 'train', 'dequeue', 'rally', 'sell', 'resign']);

function randomCode() { let s = ''; for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }

// ---------------- lobby / transport ----------------
export class Net {
  constructor() {
    this.peer = null; this.role = 'none'; this.code = ''; this.conns = new Map(); // host: slot -> conn
    this.hostConn = null; this.h = {}; this.closed = false;
  }
  on(type, fn) { this.h[type] = fn; return this; }
  emit(type, ...a) { if (this.h[type]) this.h[type](...a); }
  static available() { return typeof window !== 'undefined' && typeof window.Peer === 'function'; }

  host() {
    return new Promise((resolve, reject) => {
      if (!Net.available()) return reject(new Error('Multiplayer library failed to load (are you offline?).'));
      let attempts = 0;
      const tryOpen = () => {
        const code = randomCode();
        const peer = new window.Peer(PREFIX + code, { debug: 0 });
        let opened = false;
        peer.on('open', () => { opened = true; this.peer = peer; this.code = code; this.role = 'host'; this.bindHost(peer); resolve(code); });
        peer.on('error', (e) => {
          if (!opened) { peer.destroy(); if (e.type === 'unavailable-id' && ++attempts < 6) tryOpen(); else reject(new Error('Could not reach the matchmaking server (' + (e.type || 'error') + ').')); }
          else this.emit('error', e);
        });
      };
      tryOpen();
    });
  }
  bindHost(peer) {
    peer.on('connection', (conn) => {
      conn.on('open', () => this.emit('incoming', conn));
      conn.on('data', (m) => this.emit('data', conn, m));
      conn.on('close', () => this.emit('left', conn));
      conn.on('error', () => this.emit('left', conn));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  }
  join(code) {
    return new Promise((resolve, reject) => {
      if (!Net.available()) return reject(new Error('Multiplayer library failed to load (are you offline?).'));
      const peer = new window.Peer({ debug: 0 });
      let done = false;
      const fail = (msg) => { if (done) return; done = true; try { peer.destroy(); } catch (e) { /* ignore */ } reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Connection timed out. Check the code and try again.'), 15000);
      peer.on('error', (e) => { if (e.type === 'peer-unavailable') fail('No game found with that code.'); else if (!done) fail('Connection error (' + (e.type || 'unknown') + ').'); else this.emit('error', e); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
        conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); this.peer = peer; this.hostConn = conn; this.role = 'client'; this.code = code.toUpperCase(); resolve(); });
        conn.on('data', (m) => this.emit('data', conn, m));
        conn.on('close', () => { if (!this.closed) this.emit('hostLeft'); });
        conn.on('error', () => { if (!this.closed) this.emit('hostLeft'); });
      });
    });
  }
  sendHost(m) { if (this.hostConn && this.hostConn.open) this.hostConn.send(m); }
  sendConn(conn, m) { if (conn && conn.open) conn.send(m); }
  broadcast(m) { for (const c of this.conns.values()) if (c && c.open) c.send(m); }
  close() { this.closed = true; try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ } this.peer = null; this.conns.clear(); this.hostConn = null; this.role = 'none'; }
}

// ---------------- lockstep ----------------
export class Lockstep {
  constructor(net, role, slot) {
    this.net = net; this.role = role; this.slot = slot; // role: 'local' | 'host' | 'client'
    this.pending = []; this.queue = []; this.turnNo = 0; this.acc = 0;
    this.hashes = new Map(); this.waiting = new Map();
    this.onDesync = null; this.desynced = false;
    this.slotOfConn = new Map();
  }
  // called with commands from this player's UI
  sendLocal(c) {
    c.p = this.slot;
    if (this.role === 'client') this.net.sendHost({ k: 'cmd', c });
    else this.pending.push(c);
  }
  // host: command arrived from a remote slot
  receiveRemote(slot, c) {
    if (!c || !ALLOWED.has(c.t)) return;
    if (c.ids && c.ids.length > 300) return;
    c.p = slot; this.pending.push(c);
  }
  injectHost(c) { this.pending.push(c); }
  pushTurn(t) { this.queue.push(t); }
  // host/local: emit turns at real-time pace (only while the local queue is not backed up)
  update(dt) {
    if (this.role === 'client') return;
    this.acc += dt;
    const len = TURN_TICKS / TICK_RATE;
    let guard = 0;
    while (this.acc >= len && this.queue.length < 6 && guard++ < 8) {
      this.acc -= len;
      const t = { n: this.turnNo++, c: this.pending };
      this.pending = [];
      this.queue.push(t);
      if (this.role === 'host') this.net.broadcast({ k: 'turn', n: t.n, c: t.c });
    }
    if (this.acc > len * 4) this.acc = len * 4;
  }
  // after a turn has been fully simulated
  turnDone(n, sim) {
    if (n % 40 !== 39 || this.role === 'local') return;
    const h = sim.hash();
    if (this.role === 'host') {
      this.hashes.set(n, h);
      const w = this.waiting.get(n);
      if (w) { for (const x of w) if (x !== h) this.flagDesync(n); this.waiting.delete(n); }
      this.hashes.delete(n - 400);
    } else this.net.sendHost({ k: 'hash', n, h });
  }
  hostGotHash(n, h) {
    if (this.hashes.has(n)) { if (this.hashes.get(n) !== h) this.flagDesync(n); }
    else { const w = this.waiting.get(n) || []; w.push(h); this.waiting.set(n, w); }
  }
  flagDesync(n) { if (this.desynced) return; this.desynced = true; this.net.broadcast({ k: 'desync', n }); if (this.onDesync) this.onDesync(n); }
}
