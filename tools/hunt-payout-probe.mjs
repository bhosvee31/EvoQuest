// Probe: what does the player actually receive when they hunt, and is it
// really 30% of the victim's lifetime XP?
//
//   node tools\hunt-payout-probe.mjs

import { boot } from "./harness.mjs";

const ctx = boot();
const G = ctx.G;

function setup(rank, ageSeconds) {
  G.restart();
  const p = G.player;
  p.rank = rank;
  p.invuln = 1e9;                 // isolate the payout from being hunted
  // let the world age so creatures have a lifetime worth taking
  G.input.mx = 10; G.input.my = 10;
  for (let i = 0; i < 60 * ageSeconds; i++) {
    p.invuln = 1e9;
    G.step(1 / 60);
  }
  return p;
}

console.log(`kill share = ${G.KILL_XP_SHARE}, food = ${G.FOOD_XP} XP\n`);

for (const age of [0, 30, 60, 180, 300]) {
  const p = setup(5, age);         // player is a Sparrow
  // pick a creature below the player: highest rank that is still lower
  const prey = G.critters
    .filter(c => !c.dead && c.rank < p.rank)
    .sort((a, b) => b.rank - a.rank || b.totalXp - a.totalXp)[0];
  if (!prey) { console.log(`  age ${age}s: no prey available`); continue; }

  const before = p.totalXp;
  const preyRank = prey.rank, preyTotal = prey.totalXp;
  // walk the player onto the prey
  p.x = prey.x; p.y = prey.y;
  prey.x = p.x + 1; prey.y = p.y;
  G.step(1 / 60);

  const gained = p.totalXp - before;
  const expected = preyTotal * G.KILL_XP_SHARE;
  console.log(
    `  world age ${String(age).padStart(3)}s  prey=${G.RANKS[preyRank].name.padEnd(9)}` +
    ` lifetime=${preyTotal.toFixed(2).padStart(6)}  30% of that=${expected.toFixed(2).padStart(6)}` +
    `  player gained=${gained.toFixed(2).padStart(6)}` +
    (Math.abs(gained - expected) < 1e-6 ? "  OK" : "  MISMATCH")
  );
}

console.log(`\nFor reference, rank thresholds a player must climb through:`);
let cum = 0;
for (const r of G.RANKS) { cum += r.need; console.log(`  ${r.name.padEnd(9)} needs ${String(r.need).padStart(3)} XP  (cumulative ${cum})`); }
