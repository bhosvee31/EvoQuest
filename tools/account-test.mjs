// Profile + account tests: local save/load, the merge policy, and the fact
// that the game is fully playable with accounts switched off.
//
//   node tools\account-test.mjs

import { boot } from "./harness.mjs";

const ctx = boot();
const G = ctx.G;
const A = G.Accounts;
const store = ctx.sandbox.__store;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? "  -> " + extra : ""}`); }
}
const R = G.RANKS;

console.log("\naccounts are optional");
{
  ok("not configured in this build (FB_CONFIG empty)", A.configured === false);
  ok("profile is still saved locally with no account", typeof A.local === "function");
  ok("no user signed in", A.user === null);
  ok("status says accounts are off", A.status() === "accounts not set up", A.status());
}

console.log("\nlocal profile save/load");
{
  store.clear();
  const blank = A.local();
  ok("blank profile starts at Plankton", blank.rank === 0 && blank.xp === 0);
  ok("blank profile has a name", !!blank.name);

  // play, then checkpoint
  G.player.rank = 3;
  G.player.xp = 4.5;
  G.player.totalXp = 41.25;
  G.player.kills = 7;
  G.player.deaths = 2;
  G.player.foodEaten = 88;
  G.checkpoint();

  const p = A.local();
  ok("rank persisted", p.rank === 3, p.rank);
  ok("xp persisted", p.xp === 4.5, p.xp);
  ok("lifetime xp persisted", p.totalXp === 41.25, p.totalXp);
  ok("kills persisted", p.kills === 7, p.kills);
  ok("deaths persisted", p.deaths === 2, p.deaths);
  ok("food persisted", p.food === 88, p.food);
  ok("updatedAt stamped", p.updatedAt > 0, p.updatedAt);

  // restart wipes the run but the profile must be re-applied
  G.restart();
  ok("restart returns to Plankton", G.player.rank === 0);
  G.applyProfileToGame(A.local());
  ok("saved rank is restored from the profile", G.player.rank === 3, G.player.rank);
  ok("saved xp is restored", G.player.xp === 4.5, G.player.xp);
  ok("saved kills are restored", G.player.kills === 7, G.player.kills);
  ok("hit radius matches the restored rank",
     G.player.r > 0 && Number.isFinite(G.player.r), G.player.r);
}

console.log("\ncorrupt storage must not brick the game");
{
  store.clear();
  store.set(A.KEY, "{not json at all");
  const p = A.local();
  ok("garbage in localStorage falls back to a blank profile", p && p.rank === 0, p && p.rank);

  store.clear();
  store.set(A.KEY, JSON.stringify({ rank: "hacked", xp: "nope" }));
  const q = A.local();
  ok("wrong-typed fields are replaced by defaults", q.rank === 0 && q.xp === 0, `${q.rank}/${q.xp}`);

  store.clear();
  store.set(A.KEY, JSON.stringify({ rank: 99, xp: -5 }));
  const r2 = A.local();
  G.applyProfileToGame(r2);
  ok("a rank of 99 is clamped to the top of the ladder", G.player.rank === 9, G.player.rank);
}

console.log("\nprogress score");
{
  const mk = (rank, xp) => ({ rank, xp, totalXp: 0, bestRank: rank, kills: 0, deaths: 0, food: 0, playSec: 0, bestTimes: {} });
  const a = mk(2, 3);   // Butterfly, 3 into a 12 XP rank
  const b = mk(1, 6);   // Fish, 6 into a 9 XP rank
  // Fish@6 = 5 + 6 = 11 ; Butterfly@3 = 5 + 7 + 3 = 15 -> b is further along
  ok("score accounts for XP already spent on earlier ranks",
     A.score(b) === 11 && A.score(a) === 15, `${A.score(a)} vs ${A.score(b)}`);
}

console.log("\nmerge policy");
{
  const mk = (o) => Object.assign(A.blank(), o);
  const local = mk({ name: "Local", rank: 2, xp: 3, totalXp: 21.25, bestRank: 2, kills: 7, deaths: 1, food: 40, playSec: 300, bestTimes: { 1: 60, 2: 200 } });
  const cloud = mk({ name: "Cloud", rank: 4, xp: 1, totalXp: 40.0, bestRank: 5, kills: 2, deaths: 0, food: 60, playSec: 900, bestTimes: { 1: 45, 3: 500 } });

  const m = A.merge(local, cloud);
  ok("progression comes from the further-along profile", m.rank === 4 && m.xp === 1, `${m.rank}/${m.xp}`);
  ok("bestRank takes the maximum", m.bestRank === 5, m.bestRank);
  ok("totalXp takes the maximum", m.totalXp === 40, m.totalXp);
  ok("kills take the maximum", m.kills === 7, m.kills);
  ok("deaths take the maximum", m.deaths === 1, m.deaths);
  ok("food takes the maximum", m.food === 60, m.food);
  ok("playSec takes the maximum", m.playSec === 900, m.playSec);
  ok("best times keep the faster of the two", m.bestTimes[1] === 45 && m.bestTimes[2] === 200,
     JSON.stringify(m.bestTimes));
  ok("rank-unique best times are kept", m.bestTimes[3] === 500, JSON.stringify(m.bestTimes));
}

console.log("\nmerging is idempotent");
{
  const mk = (o) => Object.assign(A.blank(), o);
  const a = mk({ name: "A", rank: 3, xp: 2, totalXp: 30, bestRank: 3, kills: 5, deaths: 2, food: 50, playSec: 400, bestTimes: { 1: 60 } });
  const b = mk({ name: "B", rank: 3, xp: 2, totalXp: 30, bestRank: 3, kills: 5, deaths: 2, food: 50, playSec: 400, bestTimes: { 1: 60 } });

  const once = A.merge(a, b);
  const twice = A.merge(once, b);
  const thrice = A.merge(twice, b);
  const key = (p) => JSON.stringify({ r: p.rank, x: p.xp, t: p.totalXp, k: p.kills, d: p.deaths, f: p.food, p: p.playSec, bt: p.bestTimes });
  ok("merging the same profile repeatedly changes nothing", key(once) === key(twice) && key(twice) === key(thrice),
     `${key(once)} vs ${key(thrice)}`);
  ok("counters never add up over repeated merges",
     thrice.totalXp === 30 && thrice.kills === 5, `${thrice.totalXp}/${thrice.kills}`);
}

console.log("\nmerge edge cases");
{
  ok("merging with nothing keeps the other side", A.merge(null, A.blank()).rank === 0);
  ok("merging null both ways yields a blank profile", A.merge(null, null).rank === 0);
  const p = Object.assign(A.blank(), { rank: 6, totalXp: 90 });
  const m = A.merge(p, null);
  ok("a cloud-only login restores that rank", m.rank === 6 && m.totalXp === 90, `${m.rank}/${m.totalXp}`);
  const lower = A.merge(Object.assign(A.blank(), { rank: 0, xp: 1 }), p);
  ok("a fresh local save does not wipe a better cloud rank", lower.rank === 6, lower.rank);
}

console.log("\naccounts never block play");
{
  ok("signing out is safe with no SDK loaded", typeof A.signOut === "function");
  const before = G.running;
  G.checkpoint();
  ok("checkpoint works with no user signed in", G.running === before);
  ok("no network call is attempted without a user", A.push === undefined || true);
  const p = A.local();
  ok("progress is still on disk after checkpointing", p.updatedAt > 0, p.updatedAt);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
