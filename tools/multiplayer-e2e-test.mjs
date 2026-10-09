// End-to-end multiplayer test with a fake PeerJS.
//
//   node tools\multiplayer-e2e-test.mjs
//
// The existing multiplayer-test.mjs replaces Net.wrap() and pumps messages by
// hand, which means host(), join(), loadLib() and the PeerJS wrapper itself are
// never exercised. This file stands in for the PeerJS library instead, so the
// real code paths run: loadLib() -> host()/join() -> acceptPeer() -> wrap() ->
// onOpen/welcome -> snapshots -> kills.
//
// What this does NOT test: the real peerjs library, the real signalling server,
// and real internet latency. What it does test is every line of game code on
// the multiplayer path.

import { boot } from "./harness.mjs";

/* ======================================================== fake PeerJS ====== */
// A tiny but faithful stand-in: rooms are just a name -> host map, and a
// DataConnection pairs two endpoints with real async event delivery.
function makeFakePeerLib(){
  const rooms = new Map();

  class FakeDC {
    constructor(owner){
      this.peer = owner; this.other = null; this.open = false; this.handlers = {};
    }
    on(ev, cb){ (this.handlers[ev] ||= []).push(cb); return this; }
    _emit(ev, arg){ (this.handlers[ev] || []).forEach(cb => cb(arg)); }
    send(data){
      if (!this.open || !this.other) return;
      const copy = JSON.parse(JSON.stringify(data));   // structured clone
      setTimeout(() => this.other._emit("data", copy), 0);
    }
    close(){
      if (!this.open) return;
      const other = this.other;
      this.open = false;
      this._emit("close");
      if (other){ other.open = false; other._emit("close"); }
    }
  }

  class Peer {
    constructor(id, opts){
      this.id = typeof id === "string" ? id : (opts && opts.randomId) || "anon";
      this.handlers = {};
      if (typeof id === "string"){
        if (rooms.has(id)) { setTimeout(() => this._emit("error", { type: "unavailable-id" }), 0); return; }
        rooms.set(id, this);
        setTimeout(() => this._emit("open", this.id), 0);
      } else {
        setTimeout(() => this._emit("open", this.id), 0);
      }
    }
    on(ev, cb){ (this.handlers[ev] ||= []).push(cb); return this; }
    _emit(ev, arg){ (this.handlers[ev] || []).forEach(cb => cb(arg)); }
    connect(room){
      const host = rooms.get(room);
      if (!host){ setTimeout(() => this._emit("error", { type: "peer-unavailable" }), 0); return new FakeDC(this); }
      // Real PeerJS hands each side its own DataConnection instance. Modelling
      // that matters: a single shared object would send the host's broadcasts
      // straight back to the host.
      const mine = new FakeDC(this);
      const theirs = new FakeDC(host);
      mine.other = theirs; theirs.other = mine;
      setTimeout(() => host._emit("connection", theirs), 0);
      // handshake completes a moment later, after both sides have attached
      setTimeout(() => {
        mine.open = theirs.open = true;
        mine._emit("open"); theirs._emit("open");
      }, 5);
      return mine;
    }
    destroy(){
      if (this.id && rooms.get(this.id) === this) rooms.delete(this.id);
    }
  }

  Peer.__rooms = rooms;
  return Peer;
}

const settle = () => new Promise(r => setTimeout(r, 0));
const settleN = async (n) => { for (let i = 0; i < n; i++) await settle(); };

// one shared fake signalling service across every game in this file
const PeerRef = makeFakePeerLib();
function makeGame(){ return boot({ globals: { Peer: PeerRef } }).G; }

/* ================================================================ tests ==== */
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? "  -> " + extra : ""}`); }
}

console.log("\nSDK loading");
{
  const A = makeGame();
  ok("Peer was injected, so no CDN fetch happens", typeof A.Net.loadLib === "function");
  const lib = await A.Net.loadLib();
  ok("loadLib resolves the injected library without network", lib === PeerRef, typeof lib);
  ok("a second call is cached", (await A.Net.loadLib()) === PeerRef);
}

console.log("\nhosting a room");
let host, c1, c2;
{
  host = makeGame();
  const H = host;
  ok("starts offline", H.Net.mode === "offline");

  const code = await H.Net.host("arena one");
  await settle();
  ok("host() succeeds and returns the sanitised code", code === "ARENAONE", code);
  ok("mode flips to host", H.Net.mode === "host", H.Net.mode);
  ok("a seed was generated", Number.isFinite(H.Net.seed) && H.Net.seed > 0, H.Net.seed);
  ok("the room is registered in the (fake) signalling service",
     PeerRef.__rooms.has("ARENAONE"), [...PeerRef.__rooms.keys()].join(","));
  ok("no peers yet", H.Net.peers.size === 0);
}

console.log("\njoining that room");
{
  c1 = makeGame();
  const J = c1;
  const code = await J.Net.join("arena one");
  await new Promise(r => setTimeout(r, 40));
  ok("join() resolves the room code", code === "ARENAONE", code);
  ok("client mode flips to client", J.Net.mode === "client", J.Net.mode);
  ok("client learned its id", J.Net.id === 1, J.Net.id);
  ok("client learned the host seed", J.Net.seed === host.Net.seed, `${J.Net.seed} vs ${host.Net.seed}`);
  ok("client rebuilt the world from the seed",
     J.foods.length === host.foods.length, `${J.foods.length} vs ${host.foods.length}`);
  ok("host registered the peer", host.Net.peers.size === 1, host.Net.peers.size);
  const p = host.Net.peers.get(1);
  ok("peer exists on the host and is named", !!p && /Player/.test(p.name), p && p.name);
  ok("peer spawns with the spawn shield up", p && p.invuln > 0, p && p.invuln);
}

console.log("\na second client joins");
{
  c2 = makeGame();
  await c2.Net.join("ARENAONE");
  await new Promise(r => setTimeout(r, 40));
  ok("host now has two peers", host.Net.peers.size === 2, host.Net.peers.size);
  ok("ids are distinct", host.Net.peers.get(1) && host.Net.peers.get(2));
  ok("second client got id 2", c2.Net.id === 2, c2.Net.id);
  ok("all peers see the same seed",
     c1.Net.seed === c2.Net.seed && c2.Net.seed === host.Net.seed);
}

console.log("\ninput flows client -> host");
{
  const H = host, J = c1;
  J.input.mx = 400; J.input.my = 300; J.input.down = true;
  J.Net.inputAcc = -1e9;
  J.Net.sendInput();
  await settleN(3);
  const p = H.Net.peers.get(1);
  const wantX = J.input.mx + J.cam.x;
  ok("host received the client's cursor", p && Math.abs(p.input.x - wantX) < 1, p && `${p.input.x} vs ${wantX}`);
  ok("host received the boost flag", p && p.input.b === true, p && p.input.b);
}

console.log("\nhost moves the remote player");
{
  const H = host;
  const p = H.Net.peers.get(1);
  p.input.x = p.x + 300; p.input.y = p.y;
  const x0 = p.x;
  for (let i = 0; i < 30; i++) H.step(1 / 60);
  ok("the remote player moved toward its reported cursor", p.x > x0 + 10, `${x0.toFixed(0)} -> ${p.x.toFixed(0)}`);
}

console.log("\nsnapshots flow host -> clients");
{
  const H = host, J = c1;
  for (let i = 0; i < 5; i++) { H.Net.lastSnapAt = -1e9; H.Net.sendSnapshot(); await settleN(2); }
  ok("client rebuilt AI from snapshots", J.critters.length > 50, J.critters.length);
  ok("client AI is marked network-owned", J.critters.every(c => c.isNet === true));
  ok("client AI positions are finite",
     J.critters.every(c => Number.isFinite(c.x) && Number.isFinite(c.y)));
  ok("client sees the host as a player",
     J.critters.some(c => c.isPlayer === true), J.critters.filter(c => c.isPlayer).length);
  ok("client sees the host and the other client (but not itself)",
     J.critters.filter(c => c.isPlayer).length === 2,
     J.critters.filter(c => c.isPlayer).length);
}

console.log("\nclients do not simulate the world");
{
  const J = c1;
  const aiBefore = J.critters.length;
  const ai = J.critters.map(c => ({ id: c.id, x: c.x, y: c.y }));
  for (let i = 0; i < 60; i++) J.step(1 / 60);
  const moved = J.critters.filter((c, i) => c && ai[i] && (c.x !== ai[i].x || c.y !== ai[i].y)).length;
  ok("client runs no AI of its own (nothing drifts without a snapshot)",
     moved === 0 && J.critters.length === aiBefore, `${moved} moved`);
}

console.log("\nforage eaten by a remote player reaches its client");
{
  const H = host, J = c1;
  H.Net.foodGone.length = 0; H.Net.fed.length = 0;
  const p = H.Net.peers.get(1);
  p.dead = false; p.xp = 0; p.totalXp = 0;
  const live = H.foods.find(f => !f.dead);
  const eatenId = live.id;
  p.x = live.x; p.y = live.y;
  const jBefore = J.player.totalXp;
  H.eatFood(p, 1 / 60, false);
  ok("host scored the food for the remote player", p.totalXp > 0, p.totalXp);
  H.flushFoodEvents();
  await settleN(3);
  ok("the food is marked gone on the client", J.foods[eatenId] && J.foods[eatenId].dead === true);
  ok("client was credited the XP", J.player.totalXp > jBefore, `${jBefore} -> ${J.player.totalXp}`);
}

console.log("\nhost resolves PvP between two remote players");
{
  const H = host, A = c1, B = c2;
  // Put the host's two player-representations on top of each other: a rank 8
  // predator and a rank 1 victim. The host decides this, not the clients.
  const predator = H.Net.peers.get(2);   // c2 as the host sees it
  const victim   = H.Net.peers.get(1);   // c1 as the host sees it
  predator.rank = 8; predator.dead = false;
  victim.rank = 1;   victim.dead = false; victim.invuln = 0;
  predator.x = victim.x; predator.y = victim.y;
  B.player.rank = 8; B.player.invuln = 0;
  A.player.rank = 1; A.player.invuln = 0; A.player.xp = 4; A.player.totalXp = 40;
  // the host does the killing and pays out of the victim's lifetime total, so it
  // needs that total to have arrived over the wire. It used to never be sent, so
  // every PvP kill was worth a quarter of nothing.
  const predBefore = predator.totalXp;
  for (let i = 0; i < 8; i++){ A.step(1 / 60); await settle(); }

  for (let i = 0; i < 150 && !victim.dead; i++){ H.step(1 / 60); await settle(); }
  await settleN(4);
  const paid = predator.totalXp - predBefore;
  const want = 40 * H.KILL_XP_SHARE;
  ok("the host received the victim's real lifetime XP", victim.totalXp === 40, victim.totalXp);
  ok("the predator was paid a quarter of the victim's lifetime total",
     Math.abs(paid - want) < 0.05, `+${paid.toFixed(2)} expected ${want.toFixed(2)}`);
  ok("the predator killed the victim on the host", victim.dead === true, `dead=${victim.dead}`);
  ok("the victim's client was told it died", A.player.deaths >= 1, A.player.deaths);
  ok("the victim's lifetime XP was halved", A.player.totalXp === 20, A.player.totalXp);
  ok("the victim's rank bar was halved", A.player.xp < 4, A.player.xp);
  ok("the predator's own client was credited",
     B.player.kills >= 1 || B.player.totalXp > 0, `kills=${B.player.kills} xp=${B.player.totalXp}`);
}

console.log("\nleaving");
{
  await c1.Net.leave();
  await settleN(2);
  ok("client returns to offline", c1.Net.mode === "offline", c1.Net.mode);
  ok("host drops the peer", host.Net.peers.size === 1, host.Net.peers.size);
  const n = host.critters.filter(c => !c.dead).length;
  for (let i = 0; i < 60; i++) host.step(1 / 60);
  ok("host keeps simulating after a leave", host.critters.filter(c => !c.dead).length > 0 && n > 0);
}

console.log("\njoining a room that does not exist");
{
  const ghost = makeGame();
  let failed = false;
  try { await ghost.Net.join("nosuchroom"); } catch (e) { failed = true; }
  await settleN(3);
  ok("joining a missing room rejects rather than hanging", failed || ghost.Net.mode === "client",
     `failed=${failed} mode=${ghost.Net.mode}`);
  ghost.Net.leave();
}

console.log("\nroom code sanitising");
{
  const cr = (s) => c1.cleanRoom(s);
  ok("strips spaces and punctuation", cr("my room!") === "MYROOM", cr("my room!"));
  ok("upper-cases", cr("abc") === "ABC", cr("abc"));
  ok("caps length at 18", cr("abcdefghijklmnopqrstuvwxyz").length === 18, cr("abcdefghijklmnopqrstuvwxyz").length);
  ok("empty stays empty", cr("") === "", JSON.stringify(cr("")));
  ok("digits are kept", cr("room 42") === "ROOM42", cr("room 42"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
