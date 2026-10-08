// Diagnostic: why does the player still die? Run with:
//   node tools\death-diagnostic.mjs
//
// Categorises every player death during a simulated session and reports whether
// the escape tools (boost meter, warning, windup) were actually available.

import { boot } from "./harness.mjs";

const ctx = boot();
const G = ctx.G;
const WORLD = G.world;

function trial(smart, seconds) {
  G.restart();
  const dt = 1 / 60;
  let deaths = 0, starved = 0, frames = 0, unwarned = 0;
  for (let i = 0; i < 60 * seconds; i++) {
    const p = G.player;
    const threat = p.huntedBy || p.strikingBy;
    if (smart && threat && !p.dead) {
      // break contact, but do not sprint in a straight line across the map --
      // that just walks into the next predator
      const dx = p.x - threat.x, dy = p.y - threat.y;
      const d = Math.hypot(dx, dy) || 1;
      G.input.mx = p.x + (dx / d) * 260 - G.cam.x;
      G.input.my = p.y + (dy / d) * 260 - G.cam.y;
      G.input.down = p.boost > 0.2;
    } else {
      const a = i * 0.017;
      G.input.mx = 640 + Math.cos(a) * 520;
      G.input.my = 400 + Math.sin(a * 1.7) * 340;
      G.input.down = (i % 90) > 55;
    }
    if (p.boost < 0.25) starved++;
    frames++;
    const before = p.deaths;
    const wasWarned = !!threat;
    G.step(dt);
    if (p.deaths > before) { deaths++; if (!wasWarned) unwarned++; }
  }
  return { deaths, starvedPct: starved / frames * 100, rank: G.player.rank,
           xp: G.player.totalXp, food: G.player.foodEaten, unwarned };
}

const TRIALS = 6, MINUTES = 3;
console.log(`averaging ${TRIALS} independent ${MINUTES}-minute runs each\n`);
for (const [label, smart] of [["careless (random walk, boosts on a timer)", false],
                             ["careful (boosts + backs off when warned)", true]]) {
  const rs = [];
  for (let i = 0; i < TRIALS; i++) rs.push(trial(smart, MINUTES * 60));
  const avg = (f) => (rs.reduce((s, r) => s + f(r), 0) / rs.length);
  console.log(`=== ${label} ===`);
  console.log(`  deaths per run:        ${avg(r => r.deaths).toFixed(2)}  (range ${Math.min(...rs.map(r=>r.deaths))}-${Math.max(...rs.map(r=>r.deaths))})`);
  console.log(`  final rank:            ${avg(r => r.rank + 1).toFixed(2)} / 10`);
  console.log(`  food eaten:            ${avg(r => r.food).toFixed(1)}`);
  console.log(`  total XP:              ${avg(r => r.xp).toFixed(1)}`);
  console.log(`  boost empty:           ${avg(r => r.starvedPct).toFixed(1)}% of the run`);
  console.log(`  deaths with no warning:${avg(r => r.unwarned).toFixed(2)} per run`);
  console.log();
}
