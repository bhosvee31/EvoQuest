// Probe: how large does a creature's lifetime XP get, and what would a kill on
// it actually pay out now that kills take 30% of the victim's LIFETIME total?
//
//   node tools\kill-payout-probe.mjs

import { boot } from "./harness.mjs";

const ctx = boot();
const G = ctx.G;

console.log(`food = ${G.FOOD_XP} XP, kill share = ${G.KILL_XP_SHARE}, death keep = ${G.DEATH_XP_KEEP}\n`);

for (const minutes of [1, 3, 5, 10]) {
  G.restart();
  const frames = 60 * 60 * minutes;
  // let the ecosystem run undisturbed so creatures accumulate lifetime XP
  G.input.mx = 10; G.input.my = 10;          // park the player so it eats nothing
  G.player.invuln = 1e9;                     // and cannot die or disturb anything
  for (let i = 0; i < frames; i++) G.step(1 / 60);

  const totals = G.critters.map(c => c.totalXp).filter(v => Number.isFinite(v));
  totals.sort((a, b) => a - b);
  const pct = (p) => totals[Math.floor(totals.length * p)];
  const payout = pct(0.99) * G.KILL_XP_SHARE;
  console.log(`after ${String(minutes).padStart(2)} min  ` +
    `creature lifetime XP  median ${pct(0.5).toFixed(1).padStart(7)}  ` +
    `p90 ${pct(0.9).toFixed(1).padStart(7)}  max ${totals[totals.length - 1].toFixed(1).padStart(8)}   ` +
    `-> richest kill pays ${payout.toFixed(0)} XP`);
}

// what does that mean for the ladder? thresholds are cumulative
const ladder = G.RANKS.reduce((s, r) => s + r.need, 0);
console.log(`\ncumulative XP to reach Vampire: ${ladder}`);
console.log(`a single kill paying 30% of a very old creature's lifetime XP can`);
console.log(`therefore be worth several ranks at once -- capping is worth watching.`);

// is it exploitable? a revived creature keeps its lifetime total
G.restart();
const c = G.critters[0];
c.dead = true; c.deadT = 0; c.totalXp = 1234;
G.step(1 / 60);
console.log(`\nrevive resets current-rank XP but KEEPS lifetime XP: ${c.totalXp}`);
console.log(`-> that creature can be farmed for ${(1234 * G.KILL_XP_SHARE).toFixed(0)} XP per kill.`);
