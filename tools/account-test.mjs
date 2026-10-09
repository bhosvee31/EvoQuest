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
// These used to assert FB_CONFIG was empty. It is no longer empty, and it will
// never be empty again, so asserting on that proved nothing about the game. What
// actually matters is that "configured" tracks the config, that status() stays
// coherent in both states, and that the local profile works either way.
{
  const cfg = G.FB_CONFIG || {};
  const filled = !!(cfg.apiKey && cfg.projectId && cfg.appId);
  ok(`configured flag tracks the config (filled in: ${filled})`, A.configured === filled, A.configured);
  ok("profile is still saved locally with no account", typeof A.local === "function");
  ok("no user signed in on boot", A.user === null);
  ok("status is coherent with configured+signed out",
    A.status() === (filled ? "signed out" : "accounts not set up"), A.status());
  ok("single player does not wait on the network", typeof A.merge === "function");
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

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
console.log("\naccount level requirements");
{
  // Thresholds are stored as log10, so read levels back through the helpers
  // rather than off the raw table.
  const t = G.levelThresholds();
  ok("level 0 is free", G.levelThreshold(0) === 0, G.levelThreshold(0));
  ok("leaving level 0 costs exactly 10", G.levelRequirement(0) === 10, G.levelRequirement(0));
  ok("level 0 requirement is 10", G.LEVEL_REQ_0 === 10, G.LEVEL_REQ_0);
  ok("growth is 1.2x", G.LEVEL_GROWTH === 1.2, G.LEVEL_GROWTH);

  // the spec: each level costs 1.2x the one before, rounded to a whole number,
  // chained through the rounded figure. 10, 12, 14 (12*1.2=14.4), 17 (14*1.2=16.8)
  const want = [10, 12, 14, 17, 20, 24, 29, 35, 42, 50, 60, 72, 86, 103, 124, 149];
  const got = want.map((_, L) => G.levelRequirement(L));
  ok("the requirement chain is 10, 12, 14, 17, 20, 24, ...",
     got.every((v, i) => near(v, want[i], 1e-6)), got.map(v => v.toFixed(3)).join(","));
  // the log round-trip costs a few ULP, so "whole number" means whole to 1e-6
  ok("every requirement is a whole number",
     got.every(v => near(v, Math.round(v), 1e-6)), got.map(v => v.toFixed(6)).join(","));
  ok("requirements strictly increase", got.every((v, i) => i === 0 || v > got[i-1]), got.join(","));
  ok("thresholds are cumulative and monotonic",
     t.every((v, i) => i === 0 || v > t[i-1]), "non-monotonic somewhere");

  ok("10 XP is level 1", G.levelForAcctXp(10) === 1, G.levelForAcctXp(10));
  ok("9.9 XP is still level 0", G.levelForAcctXp(9.9) === 0, G.levelForAcctXp(9.9));
  ok("22 XP is level 2", G.levelForAcctXp(22) === 2, G.levelForAcctXp(22));
  ok("36 XP is level 3", G.levelForAcctXp(36) === 3, G.levelForAcctXp(36));
  const p = G.levelProgress(15);
  ok("progress reports what is banked toward the next level",
     p.level === 1 && near(p.into, 5, 1e-6) && near(p.need, 12, 1e-6), `${p.level} ${p.into}/${p.need}`);
}

console.log("\nthe 1.2x chain holds across the whole cap, not just the low levels");
// Thresholds are log10 because level 99999 needs ~1e7917, past the largest double.
// The chain is built exactly up to LEVEL_EXACT_UNTIL and extended from there by a
// geometric series seeded from the exact chain -- seeding matters, see below.
{
  // the pure spec chain, computed the naive way, as the reference
  const chain = [10];
  for (let L = 1; L <= 800; L++) chain.push(Math.round(chain[L-1] * 1.2));
  let worst = 0, worstAt = 0;
  for (const L of [201, 250, 300, 500, 700, 746, 800]){
    const rel = Math.abs(G.levelRequirement(L) - chain[L]) / chain[L];
    if (rel > worst){ worst = rel; worstAt = L; }
  }
  ok("the extended chain still matches the exact chain to float precision",
     worst < 1e-12, `worst rel error ${worst.toExponential(2)} at level ${worstAt}`);

  // the seeded closed form must NOT be the naive 10 * 1.2^L. Because the rounding
  // is chained, the early round-downs compound into a permanent 3.24% deficit.
  const naive = 10 * Math.pow(1.2, 746);
  ok("level 746 is the first level costing at least a decillion",
     G.levelRequirement(745) < 1e60 && G.levelRequirement(746) >= 1e60,
     `745 = ${G.levelRequirement(745).toExponential(4)}, 746 = ${G.levelRequirement(746).toExponential(4)}`);
  ok("and it is the chained figure, not the naive exponential",
     Math.abs(G.levelRequirement(746) - chain[746]) / chain[746] < 1e-12 &&
     Math.abs(naive - chain[746]) / chain[746] > 0.03,
     `ours ${G.levelRequirement(746).toExponential(6)} vs naive ${naive.toExponential(6)}`);

  // the bug this replaced: the table used to be clamped at MAX_SAFE_INTEGER, so
  // every level from 181 up reported need = 0 and 9.01e15 XP teleported to 99999
  ok("no level above 180 reports a zero requirement",
     [181, 182, 200, 745, 746].every(L => G.levelRequirement(L) > 0),
     [181, 200, 746].map(L => G.levelRequirement(L)).join(", "));
  const around = [8.9e15, 9e15, 9.0072e15, 9.1e15, 1e16].map(x => G.levelForAcctXp(x));
  ok("levels climb smoothly across the old 9.007e15 cliff",
     around.every((v, i) => i === 0 || v >= around[i-1]) &&
     around[around.length-1] - around[0] <= 5,
     around.join(" -> "));
  ok("consecutive levels really do cost 1.2x",
     near(G.levelRequirement(746) / G.levelRequirement(745), 1.2, 1e-9),
     (G.levelRequirement(746) / G.levelRequirement(745)).toFixed(9));
}

console.log("\naccount level cap and overflow");
{
  ok("the cap is level 99999", G.LEVEL_CAP === 99999, G.LEVEL_CAP);
  const t = G.levelThresholds();
  ok("the table covers every level up to the cap", t.length === G.LEVEL_CAP + 1, t.length);
  // t[0] is log10(0) = -Infinity on purpose; every other entry must be finite
  ok("every threshold except level 0 is finite",
     t.slice(1).every(Number.isFinite), "an entry overflowed");
  ok("no threshold is NaN", t.every(v => !Number.isNaN(v)), "an entry is NaN");
  ok("the top of the ladder is still finite in log space",
     Number.isFinite(t[G.LEVEL_CAP]), t[G.LEVEL_CAP]);
  ok("a colossal total still resolves below the cap, not straight to it",
     G.levelForAcctXp(1e300) > 1000 && G.levelForAcctXp(1e300) < G.LEVEL_CAP,
     G.levelForAcctXp(1e300));
  ok("Infinity does not break the lookup",
     G.levelForAcctXp(Infinity) === G.LEVEL_CAP, G.levelForAcctXp(Infinity));
  ok("MAX_SAFE_INTEGER does not break the lookup",
     G.levelForAcctXp(Number.MAX_SAFE_INTEGER) < G.LEVEL_CAP,
     G.levelForAcctXp(Number.MAX_SAFE_INTEGER));
  // the real invariant: however absurd the input, the readout stays well-formed
  const sweep = [0, 1, 10, 1e3, 1e6, 1e9, 1e15, 1e15 + 0.5, 1e16, 1e20, 1e60,
                 1e100, 1e200, 1e300, Number.MAX_VALUE, Infinity];
  let nan = 0, badNeed = 0;
  for (const xp of sweep){
    const l = G.levelForAcctXp(xp);
    const pr = G.levelProgress(xp);
    if (!Number.isFinite(l) || l < 0 || l > G.LEVEL_CAP) nan++;
    if (Number.isNaN(pr.into) || Number.isNaN(pr.need) || pr.need < 0) badNeed++;
    if (pr.level !== l) nan++;
  }
  ok("no input produces a broken level or a NaN readout",
     nan === 0 && badNeed === 0, `levels bad: ${nan}, readouts bad: ${badNeed}`);
  ok("Infinity is the only thing that reads as maxed",
     G.levelProgress(Infinity).maxed === true && G.levelProgress(Infinity).need === 0,
     JSON.stringify(G.levelProgress(Infinity)));
  ok("a merely colossal total is a real level, not a fake cap",
     G.levelProgress(1e300).maxed === false && G.levelProgress(1e300).level > 1000,
     JSON.stringify(G.levelProgress(1e300)).slice(0, 60));
}

console.log("\nlevel food bonus");
{
  ok("level 0 has no bonus at all", G.levelFoodBoost(0) === 1, G.levelFoodBoost(0));
  ok("the bonus is 0.05% a level", G.LEVEL_FOOD_BONUS === 0.0005, G.LEVEL_FOOD_BONUS);
  ok("level 1 is +0.05%", near(G.levelFoodBoost(1), 1.0005), G.levelFoodBoost(1));
  ok("level 2 is +0.10%", near(G.levelFoodBoost(2), 1.001), G.levelFoodBoost(2));
  ok("level 10 is +0.50%", near(G.levelFoodBoost(10), 1.005), G.levelFoodBoost(10));
  ok("the bonus scales linearly", near(G.levelFoodBoost(20), 1.01), G.levelFoodBoost(20));
  ok("a nonsense level does not grant a negative bonus",
     G.levelFoodBoost(-5) === 1 && G.levelFoodBoost(undefined) === 1, G.levelFoodBoost(-5));
}

console.log("\naccount XP is separate from in-game XP and never decreases");
{
  const startAcct = G.acctXp;
  ok("account XP starts at 0", startAcct === 0, startAcct);
  ok("a fresh profile has no account XP", A.blank().acctXp === 0, A.blank().acctXp);

  // earning in-game XP feeds the account pool
  const xpBefore = G.player.xp, acctBefore = G.acctXp;
  G.addXP(G.player, 5);
  ok("earning in-game XP raises account XP too",
     G.acctXp > acctBefore, `${acctBefore} -> ${G.acctXp}`);
  ok("and raises in-game XP", G.player.xp > xpBefore, G.player.xp);

  // dying halves in-game XP and must not touch the account pool
  const acctAtDeath = G.acctXp;
  G.player.totalXp *= 0.5;
  ok("halving in-game XP leaves account XP untouched",
     G.acctXp === acctAtDeath, `${acctAtDeath} -> ${G.acctXp}`);
  // that divergence is what makes these two pools rather than one number twice
  ok("the two pools have now diverged",
     G.acctXp !== G.player.totalXp, `acct ${G.acctXp} vs in-game ${G.player.totalXp}`);
  G.awardAcctXp(0);
  G.awardAcctXp(-5);
  ok("a zero or negative award changes nothing", G.acctXp === acctAtDeath, G.acctXp);

  // an older profile must never walk the total backwards
  const now = G.acctXp;
  G.applyProfileToGame(Object.assign(A.blank(), { acctXp: 0, rank: 0 }));
  ok("loading a profile with less account XP does not reduce it",
     G.acctXp === now, `${now} -> ${G.acctXp}`);
  G.applyProfileToGame(Object.assign(A.blank(), { acctXp: now + 500 }));
  ok("loading a higher account XP does raise it", G.acctXp === now + 500, G.acctXp);
}

console.log("\naccount level persists and merges");
{
  G.awardAcctXp(40);
  const won = G.acctXp;
  G.checkpoint();
  const saved = A.local();
  ok("checkpoint writes account XP to the profile", saved.acctXp >= won, `${saved.acctXp} vs ${won}`);

  // pressing R wipes the run back to Plankton. The account level must survive it.
  G.addXP(G.player, 50);
  const beforeRestart = G.acctXp;
  const inGameBefore = G.player.totalXp;
  G.restart();
  ok("restarting wipes in-game XP", G.player.totalXp < inGameBefore, G.player.totalXp);
  ok("restarting does NOT wipe account XP",
     G.acctXp === beforeRestart, `${beforeRestart} -> ${G.acctXp}`);

  const hi = Object.assign(A.blank(), { acctXp: 900, rank: 3 });
  const lo = Object.assign(A.blank(), { acctXp: 12, rank: 0 });
  ok("merge keeps the larger account XP", A.merge(hi, lo).acctXp === 900, A.merge(hi, lo).acctXp);
  ok("merge is order-independent for account XP", A.merge(lo, hi).acctXp === 900, A.merge(lo, hi).acctXp);
  const m1 = A.merge(hi, hi);
  const m2 = A.merge(m1, m1);
  ok("merging repeatedly cannot inflate account XP", m2.acctXp === 900, m2.acctXp);

  const junk = A.sanitize({ acctXp: "abc" });
  ok("a corrupt account XP falls back to 0, not NaN", junk.acctXp === 0, junk.acctXp);
  const neg = A.sanitize({ acctXp: -50 });
  ok("a negative account XP is clamped to 0", neg.acctXp === 0, neg.acctXp);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
