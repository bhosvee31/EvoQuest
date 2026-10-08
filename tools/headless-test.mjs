// Headless test harness for EvoQuest.
//
//   node tools\headless-test.mjs
//
// Boots index.html's game script in a stubbed DOM (see harness.mjs) and
// exercises the actual rules: floor-food XP, rank-up thresholds, eating lower
// ranks, the 25% kill share, the 50% death penalty and the boost meter.
//
// Not shipped with the game - a development aid only.

import { boot } from "./harness.mjs";

const ctx = boot();
const G = ctx.G;

// ------------------------------------------------------------------- helpers
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? "  -> " + extra : ""}`); }
}
function near(a, b, eps = 1e-6) { return Math.abs(a - b) < eps; }
function step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) G.step(dt); }

function clearField() {
  for (const f of G.foods) { f.dead = true; f.respawn = 9999; }
  for (const c of G.critters) { c.dead = true; c.deadT = 9999; }
}
function resetPlayer() {
  const p = G.player;
  p.rank = 0; p.xp = 0; p.totalXp = 0; p.kills = 0; p.deaths = 0; p.foodEaten = 0;
  p.dead = false; p.deadT = 0; p.boost = G.BOOST_MAX; p.vx = 0; p.vy = 0;
  p.invuln = 0;                       // tests opt into the shield explicitly
  p.x = 1700; p.y = 1200;
}
function putFood(dx, dy) {
  const p = G.player;
  const f = G.spawnFoodAt(p.x + dx, p.y + dy, "algae");
  f.dead = false; f.respawn = 0;
  G.foods.push(f);
  return f;
}
function spawnNpc(rank, dx, dy) {
  const p = G.player;
  const c = {
    isPlayer: false, rank, xp: 0, x: p.x + dx, y: p.y + dy, vx: 0, vy: 0,
    r: 20, face: 1, wobble: 0, boost: 5, boosting: false, burst: 0, flash: 0,
    dead: false, deadT: 0, state: "wander", target: null, think: 99,
    wanderAng: 0, wanderT: 99, totalXp: 0, kills: 0, deaths: 0, foodEaten: 0,
    bestRank: rank, label: "npc"
  };
  G.critters.push(c);
  return c;
}

// --------------------------------------------------------------------- tests
console.log("\nsprite data");
{
  const R = G.RANKS;
  ok("10 ranks", R.length === 10, R.length);
  ok("rank order matches spec",
     R.map(r => r.name).join(",") === "Plankton,Fish,Butterfly,Bee,Crab,Sparrow,Pigeon,Wasp,Owl,Vampire",
     R.map(r => r.name).join(","));
  ok("every rank needs more XP than the last",
     R.every((r, i) => i === 0 || r.need > R[i - 1].need),
     R.map(r => r.need).join(","));
  ok("first rank needs 5 XP", R[0].need === 5, R[0].need);
  ok("floor food is worth 0.5 XP", G.FOOD_XP === 0.5, G.FOOD_XP);
  ok("kill share is 25%", G.KILL_XP_SHARE === 0.25, G.KILL_XP_SHARE);
  ok("death keeps 50%", G.DEATH_XP_KEEP === 0.5, G.DEATH_XP_KEEP);
  ok("boost caps at 5s", G.BOOST_MAX === 5, G.BOOST_MAX);
}

console.log("\nfloor food -> XP");
{
  clearField(); resetPlayer();
  putFood(0, 0);
  step(2);
  ok("eating one food gives exactly 0.5 XP", near(G.player.xp, 0.5), G.player.xp);
  ok("food counter increments", G.player.foodEaten === 1, G.player.foodEaten);
  for (let i = 0; i < 8; i++) { putFood(0, 0); step(1); }
  ok("nine foods = 4.5 XP", near(G.player.xp, 4.5), G.player.xp);
  ok("nine foods is still Plankton", G.player.rank === 0, G.player.rank);
  putFood(0, 0);
  step(1);
  ok("the tenth food trips the 5 XP threshold", G.player.rank === 1, `rank ${G.player.rank}`);
  ok("no leftover XP after the promotion", near(G.player.xp, 0), G.player.xp);
  ok("ten foods counted", G.player.foodEaten === 10, G.player.foodEaten);
}

console.log("\nevolving");
{
  clearField(); resetPlayer();
  G.addXP(G.player, 4.5);
  ok("below threshold keeps you Plankton", G.player.rank === 0 && near(G.player.xp, 4.5), `${G.player.rank}/${G.player.xp}`);
  G.addXP(G.player, 0.5);
  ok("5.0 XP promotes Plankton -> Fish", G.player.rank === 1, `rank ${G.player.rank}`);
  ok("leftover XP carries over", near(G.player.xp, 0), G.player.xp);
  ok("next threshold rose to 7", G.RANKS[1].need === 7, G.RANKS[1].need);
  G.addXP(G.player, 7);
  ok("7.0 XP promotes Fish -> Butterfly", G.player.rank === 2, `rank ${G.player.rank}`);
  G.addXP(G.player, 1000);
  ok("XP cannot exceed Vampire", G.player.rank === 9, `rank ${G.player.rank}`);
  ok("Vampire XP is capped at its own threshold", G.player.xp <= G.RANKS[9].need, G.player.xp);
  const before = G.player.totalXp;
  G.addXP(G.player, 2);
  ok("max rank still banks XP as a score", G.player.totalXp > before && G.player.rank === 9);
}

console.log("\nhunting lower ranks");
{
  clearField(); resetPlayer();
  G.player.rank = 2;                                   // Butterfly
  const victim = spawnNpc(0, 1, 0);                   // Plankton
  victim.xp = 4.0;
  step(2);
  ok("Butterfly eats Plankton", G.player.kills === 1, G.player.kills);
  ok("kill grants 25% of victim XP (1.0)", near(G.player.xp, 1.0), G.player.xp);
  ok("victim is marked dead", victim.dead === true);
}
{
  clearField(); resetPlayer();
  G.player.rank = 9;                                   // Vampire
  const victim = spawnNpc(4, 1, 0);
  victim.xp = 2.0;
  step(2);
  ok("Vampire eats Crab", G.player.kills === 1, G.player.kills);
  ok("kill grants 25% (0.5)", near(G.player.xp, 0.5), G.player.xp);
}
{
  clearField(); resetPlayer();
  G.player.rank = 2;
  const rival = spawnNpc(2, 1, 0);                    // same rank
  step(4);
  ok("equal ranks cannot eat each other", G.player.kills === 0 && G.player.deaths === 0 && !rival.dead);
}

console.log("\nbeing eaten");
{
  clearField(); resetPlayer();
  G.player.rank = 1;                                   // Fish
  G.player.xp = 6.0;
  const killer = spawnNpc(5, 1, 0);                   // Sparrow
  step(2);
  ok("higher rank eats the player", G.player.deaths === 1, G.player.deaths);
  ok("player is dead", G.player.dead === true);
  ok("player keeps 50% of XP (3.0)", near(G.player.xp, 3.0), G.player.xp);
  ok("killer gains 25% of the player's XP", near(killer.xp, 1.5), killer.xp);
}
{
  clearField(); resetPlayer();
  G.player.rank = 1; G.player.xp = 6.0;
  spawnNpc(8, 1, 0);                                   // Owl
  step(2);
  ok("death does not drop the player below rank 1", G.player.rank === 1, G.player.rank);
  step(60 * 3);                                        // wait out the respawn timer
  ok("player respawns automatically", G.player.dead === false);
}

console.log("\nboost meter");
{
  clearField(); resetPlayer();
  G.input.down = true; G.input.mx = G.player.x + 400; G.input.my = G.player.y;
  step(60);
  ok("holding click drains the boost meter", G.player.boost < G.BOOST_MAX, G.player.boost);
  ok("boosting flag is set", G.player.boosting === true);
  G.input.down = false;
  const held = G.player.boost;
  step(30);
  ok("boost does not refill on its own", near(G.player.boost, held, 0.01), G.player.boost);
  putFood(0, 0);
  step(2);
  ok("eating food refills boost", G.player.boost > held, `${held} -> ${G.player.boost}`);
}
{
  clearField(); resetPlayer();
  G.player.boost = 0.2;
  G.input.down = true; G.input.mx = G.player.x + 400; G.input.my = G.player.y;
  step(120);
  ok("boost stops at zero, never negative", G.player.boost >= 0, G.player.boost);
  ok("boosting releases when the meter empties", G.player.boosting === false);
  G.input.down = false;
}
{
  clearField(); resetPlayer();
  G.player.rank = 3;                                   // Bee
  const victim = spawnNpc(1, 1, 0);
  victim.xp = 4.0;
  G.player.boost = 0;
  step(2);
  ok("a kill refills boost", G.player.boost > 0, G.player.boost);
}

console.log("\nmovement");
{
  clearField(); resetPlayer();
  G.input.down = false;
  step(1);
  const x0 = G.player.x;
  G.input.mx = 200; G.input.my = 400;                   // cursor well left of the player
  step(30);
  ok("player moves left when the cursor is to the left", G.player.x < x0 - 10, `${x0} -> ${G.player.x}`);
  const x1 = G.player.x;
  G.input.mx = 1100;                                  // cursor to the right
  step(30);
  ok("player reverses when the cursor crosses over", G.player.x > x1 + 10, `${x1} -> ${G.player.x}`);
}

console.log("\nspawn shield");
{
  clearField(); resetPlayer();
  G.player.rank = 1; G.player.xp = 6.0;
  G.player.invuln = 2.0;
  const killer = spawnNpc(8, 1, 0);
  step(30);
  ok("spawn shield blocks being eaten", G.player.dead === false && G.player.deaths === 0);
  G.player.invuln = 0;
  step(2);
  ok("shield wears off and the kill lands", G.player.dead === true, `invuln gone, dead=${G.player.dead}`);
}

console.log("\nsoak: 3 minutes of simulated play");
{
  // fresh, fully populated world
  G.restart();
  let threw = null;
  const t0 = Date.now();
  try {
    for (let i = 0; i < 60 * 180; i++) {
      const a = i * 0.017;
      G.input.mx = 640 + Math.cos(a) * 520;
      G.input.my = 400 + Math.sin(a * 1.7) * 340;
      G.input.down = (i % 90) > 55;
      G.step(1 / 60);
    }
  } catch (e) { threw = e; }
  ok("10 800 frames without throwing", threw === null, threw && threw.stack);
  ok("finished in reasonable time", Date.now() - t0 < 60000, `${Date.now() - t0}ms`);

  const p = G.player;
  const finite = (v) => typeof v === "number" && isFinite(v);
  ok("player position is finite", finite(p.x) && finite(p.y), `${p.x},${p.y}`);
  ok("player stays inside the world", p.x >= 0 && p.x <= 3000 && p.y >= 0 && p.y <= 2100, `${p.x.toFixed(0)},${p.y.toFixed(0)}`);
  ok("player rank is valid", p.rank >= 0 && p.rank <= 9, p.rank);
  ok("player XP is finite and bounded", finite(p.xp) && p.xp <= G.RANKS[p.rank].need, p.xp);
  ok("boost meter stays within 0..5", p.boost >= 0 && p.boost <= G.BOOST_MAX, p.boost);

  const badCritter = G.critters.find(c =>
    !finite(c.x) || !finite(c.y) || !finite(c.xp) || c.rank < 0 || c.rank > 9);
  ok("every NPC has finite state", !badCritter, badCritter && JSON.stringify({ x: badCritter.x, y: badCritter.y, xp: badCritter.xp, rank: badCritter.rank }));

  const badFood = G.foods.find(f => !finite(f.x) || !finite(f.y));
  ok("every food item has finite state", !badFood);

  const liveFood = G.foods.filter(f => !f.dead).length;
  ok("food is replenished, not exhausted", liveFood > 100, `${liveFood} live of ${G.foods.length}`);

  const liveNpc = G.critters.filter(c => !c.dead).length;
  ok("NPC population stays populated", liveNpc > 40, `${liveNpc} live of ${G.critters.length}`);

  const evolved = G.critters.filter(c => c.rank > 0).length;
  ok("the ecosystem actually evolves upward", evolved > 0, `${evolved} NPCs above rank 0`);
  console.log(`        player ended at ${G.RANKS[p.rank].name} rank ${p.rank + 1}, ${p.totalXp.toFixed(1)} XP, ` +
              `${p.foodEaten} food, ${p.kills} kills, ${p.deaths} deaths`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
