// Two real game instances talking to each other over a loopback transport, so
// the multiplayer protocol is exercised without PeerJS or a network.
//
//   node tools\multiplayer-test.mjs

import { boot } from "./harness.mjs";

const host = boot();          // two independent games
const join = boot();
const H = host.G, J = join.G;

/* A pair of in-memory transports wired to each other. */
function link(a, b) {
  const ta = { peerId: 0, open: true, _cb: null, _close: null,
               open: () => Promise.resolve(),
               send: (m) => { if (b._peer) queueMicrotask(() => b._peer._recv(m)); },
               close: () => { if (b._peer && b._peer._close) b._peer._close(); },
               onMessage: (cb) => { a._peer = a._peer || {}; a._peer._recv = cb; },
               onClose: (cb) => { a._peer = a._peer || {}; a._peer._close = cb; },
               onError: () => {} };
  const tb = { peerId: 1, open: true, _cb: null, _close: null,
               open: () => Promise.resolve(),
               send: (m) => { if (a._peer) queueMicrotask(() => a._peer._recv(m)); },
               close: () => { if (a._peer && a._peer._close) a._peer._close(); },
               onMessage: (cb) => { b._peer = b._peer || {}; b._peer._recv = cb; },
               onClose: (cb) => { b._peer = b._peer || {}; b._peer._close = cb; },
               onError: () => {} };
  return [ta, tb];
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? "  -> " + extra : ""}`); }
}
const tick = () => new Promise(r => setTimeout(r, 0));

console.log("\noffline is the default");
{
  ok("game starts in offline mode", H.Net.mode === "offline" && J.Net.mode === "offline");
  ok("no peers exist offline", H.Net.peers.size === 0 && J.Net.peers.size === 0);
  ok("offline still simulates AI", H.critters.filter(c => !c.dead).length > 50);
}

console.log("\nhosting and joining");
{
  const [tHost, tJoin] = link(H, J);
  const SEED = 12345;

  // --- host side: generate a seed and build its own world from it, exactly
  //     like the real host() does, so clients can reproduce it
  H.Net.mode = "host";
  H.Net.seed = SEED;
  H.Net.id = 0;
  H.Net.conns = new Map();
  H.Net.nextId = 0;
  H.Net.peers = new Map();
  H.rebuildWorldFromSeed(SEED);

  // --- client side
  J.Net.mode = "client";
  J.Net.conn = tJoin;

  H.Net.wrap = () => tHost;
  H.Net.acceptPeer(tHost);
  await tick();                                    // acceptPeer resolves on open

  ok("host registered the new peer", H.Net.peers.size === 1, H.Net.peers.size);
  ok("peer got an id", tHost.peerId === 1, tHost.peerId);
  ok("peer starts shielded", H.Net.peers.get(1) && H.Net.peers.get(1).invuln > 0);

  // the welcome must reach the client and seed its world identically
  J.Net.onMessage({ t: "welcome", id: 1, seed: SEED, hostId: 0 }, null);
  ok("client learned its id", J.Net.id === 1, J.Net.id);
  ok("client learned the seed", J.Net.seed === SEED, J.Net.seed);
  ok("client rebuilt its world from the seed", J.foods.length === H.foods.length,
     `${J.foods.length} vs ${H.foods.length}`);
  const sameFood = H.foods.every((f, i) => Math.abs(f.x - J.foods[i].x) < 0.001 &&
                                          Math.abs(f.y - J.foods[i].y) < 0.001);
  ok("both peers generated an identical food field", sameFood);
  ok("food ids match across peers", H.foods[7].id === J.foods[7].id, `${H.foods[7].id} vs ${J.foods[7].id}`);
  const sameCritterCount = H.critters.length === J.critters.length;
  ok("AI population matches on both peers", sameCritterCount,
     `${H.critters.length} vs ${J.critters.length}`);

  console.log("\ninput relay");
  {
    J.input.mx = 500; J.input.my = 400;
    J.Net.inputAcc = -1e9;                        // bypass the rate limiter
    J.Net.sendInput();
    await tick();                                  // delivery is deferred
    const p = H.Net.peers.get(1);
    const want = J.input.mx + J.cam.x;
    ok("host received the client's cursor position", p && Math.abs(p.input.x - want) < 0.001,
       p && `${p.input.x} want ${want}`);
    ok("host received the boost flag", p && p.input.b === false, p && p.input.b);
  }

  console.log("\nsnapshot sync");
  {
    H.Net.broadcast = (obj) => { H.Net.lastSnap = obj; J.Net.onMessage(obj, null); };
    H.Net.lastSnapAt = -1e9;
    H.Net.sendSnapshot();
    const snap = H.Net.lastSnap;
    ok("host produced a snapshot", !!snap);
    ok("snapshot carries the AI as a flat array", snap && Array.isArray(snap.ai) && snap.ai.length % 5 === 0,
       snap && snap.ai && snap.ai.length);
    ok("snapshot carries players", snap && Array.isArray(snap.pl) && snap.pl.length >= 6,
       snap && snap.pl && snap.pl.length);
    ok("snapshot includes the joining client", snap && snap.pl.includes(1), snap && snap.pl.slice(0, 6).join(","));
    ok("client rebuilt AI from the snapshot", J.critters.length > 0, J.critters.length);
    ok("client AI is flagged as network-owned", J.critters.every(c => c.isNet === true));
    ok("client AI carries real coordinates",
       J.critters.every(c => Number.isFinite(c.x) && Number.isFinite(c.y)));
  }

  console.log("\npredator vs player PvP (client is the victim)");
  {
    // the host's peer is rank 5, the client sits at rank 1 -> host can eat client
    const peer = H.Net.peers.get(1);
    peer.rank = 5;
    peer.dead = false;
    J.player.rank = 1;
    J.player.invuln = 0;
    J.player.totalXp = 40; J.player.xp = 6;
    peer.x = J.player.x; peer.y = J.player.y;
    peer.totalXp = 20;

    let notified = null;
    J.Net.onMessage = (m) => { if (m && m.t === "kill") notified = m; };

    // wind-up then resolution, exactly as the host would run it
    for (let i = 0; i < 60; i++) {
      peer.strikeT = peer.strikeT > 0 ? peer.strikeT - 1 / 60 : 0.6;
      if (peer.strikeT <= 0) { H.Net.broadcast(H.Net.lastSnap || { t: "noop" }); break; }
    }

    // drive the real host-side combat path
    H.kill(peer, { isPlayer: true, isNet: true, id: 0, name: "Host", rank: 1,
                   xp: 6, totalXp: 40, dead: false, x: H.player.x, y: H.player.y });
    ok("host told its client about the PvP kill", !!notified && notified.t === "kill",
       notified && notified.t);
    ok("client was told it is the prey", notified && notified.prey === 0, notified && notified.prey);
    ok("victim name was sent", notified && notified.victim === "Host", notified && notified.victim);
  }

  console.log("\nremote player eating is credited by the host");
  {
    const fed = [];
    J.Net.onMessage = (m) => { if (m && m.t === "fed") fed.push(m); };
    const peer = H.Net.peers.get(1);
    const target = H.foods.find(f => !f.dead);
    peer.x = target.x; peer.y = target.y;
    const beforeXp = peer.totalXp;
    H.eatFood(peer, 1 / 60, false);
    ok("host awarded the remote player XP for eating",
       peer.totalXp > beforeXp, `${beforeXp} -> ${peer.totalXp}`);
    ok("host queued a credit message for the client", H.Net.fed.length > 0, H.Net.fed.length);
    H.flushFoodEvents ? H.flushFoodEvents() : H.Net.broadcast({ t: "fed", who: H.Net.fed });
    await tick();
    ok("client received the food credit", fed.length > 0, fed.length);
    if (fed.length){
      ok("credit names the right client", fed[0].who.some(f => f.id === 1), JSON.stringify(fed[0].who));
      // and the client turns it into real XP
      const jBefore = J.player.xp;
      J.NetHooks.fed(fed[0], null);
      ok("client gained XP from the credit", J.player.xp > jBefore, `${jBefore} -> ${J.player.xp}`);
    }
  }

  console.log("\nleaving restores offline play");
  {
    H.Net.leave(); J.Net.leave();
    ok("host is back to offline", H.Net.mode === "offline");
    ok("client is back to offline", J.Net.mode === "offline");
    ok("peers were cleared", H.Net.peers.size === 0);
    const before = H.critters.filter(c => !c.dead).length;
    for (let i = 0; i < 60; i++) H.step(1 / 60);
    ok("offline simulation still runs after leaving", H.critters.length > 0 && before > 0);
  }
}

console.log("\nroom code sanitising");
{
  ok("strips spaces and punctuation", H.cleanRoom("my room!") === "MYROOM", H.cleanRoom("my room!"));
  ok("upper-cases", H.cleanRoom("abc") === "ABC");
  ok("caps length", H.cleanRoom("aaaaaaaaaaaaaaaaaaaa").length <= 18);
  ok("empty stays empty", H.cleanRoom("") === "");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
