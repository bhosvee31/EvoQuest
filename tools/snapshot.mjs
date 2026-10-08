// Renders real EvoQuest frames to PNG so the game view can be eyeballed
// without a browser.
//
//   node tools\snapshot.mjs [outDir]
//
// Frames are warmed up with logic-only steps (fast), then painted once with the
// game's own render() through the harness' software canvas.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { boot, pumpFrame, writePNG } from "./harness.mjs";

const outDir = process.argv[2] || join(tmpdir(), "opencode", "evoquest-shots");
mkdirSync(outDir, { recursive: true });

const W = 1180, H = 740;
const ctx = boot({ width: W, height: H });
const G = ctx.G;
const gameCanvas = ctx.byId("game");
const startRank = Number(process.env.RANK || 0);

const SHOTS = [
  { name: "01-start-plankton", rank: 0, frames: 90,   cursor: [W * 0.62, H * 0.42] },
  { name: "02-mid-game-bee",   rank: 3, frames: 240,  cursor: [W * 0.5,  H * 0.5] },
  { name: "03-late-game-owl",  rank: 8, frames: 300,  cursor: [W * 0.55, H * 0.6] },
  { name: "04-peak-vampire",   rank: 9, frames: 200,  cursor: [W * 0.5,  H * 0.35] }
];

console.log(`world ${W}x${H}`);

for (const shot of SHOTS) {
  // reset to a clean state at the requested rank
  G.player.rank = shot.rank;
  G.player.xp = G.RANKS[shot.rank].need * 0.55;
  G.player.dead = false;
  G.player.deadT = 0;
  G.player.boost = G.BOOST_MAX;
  G.player.x = 1700; G.player.y = 1200;
  G.input.mx = shot.cursor[0];
  G.input.my = shot.cursor[1];
  G.input.active = true;

  for (let i = 0; i < shot.frames; i++) {
    // wander the cursor so the world keeps breathing
    const a = i * 0.02;
    G.input.mx = W * 0.5 + Math.cos(a) * W * 0.18;
    G.input.my = H * 0.5 + Math.sin(a * 1.3) * H * 0.18;
    G.input.down = (i % 120) > 80;
    G.step(1 / 60);
  }
  G.input.down = false;

  pumpFrame(ctx, 1000);   // one real frame -> update + render

  const path = join(outDir, shot.name + ".png");
  writePNG(path, gameCanvas.width, gameCanvas.height, gameCanvas._buf);
  console.log(`  ${shot.name}  rank ${G.player.rank} (${G.RANKS[G.player.rank].name})  xp ${G.player.xp.toFixed(1)}  boost ${G.player.boost.toFixed(1)}s  -> ${path}`);
}

console.log(`\nwrote ${SHOTS.length} frames to ${outDir}`);
