// Renders the in-game bestiary (the "C" panel) to a PNG, using the same layout
// math and sprite sources the panel uses.
//
//   node tools\codex-shot.mjs

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { boot, writePNG } from "./harness.mjs";

const outDir = join(tmpdir(), "opencode", "evoquest-shots");
mkdirSync(outDir, { recursive: true });

const W = 900, H = 640;
const ZOOM = 5, CSS = 0.62;                 // matches buildCodex()
const ctx = boot({ width: W, height: H });
const G = ctx.G;
const SPRITES = G.sprites;

const order = G.RANKS.map(r => r.key).concat(["algae", "berry", "krill", "mushroom"]);
const COLS = 7;
const CELL_W = (W - 68) / COLS;
const CELL_H = 96;

const cv = ctx.byId("game");
cv.width = W; cv.height = H;
const g = cv.getContext("2d");

// panel chrome, mirroring the #codex / #codexBox / .codexCell CSS
g.fillStyle = "rgba(4,10,18,.94)"; g.fillRect(0, 0, W, H);
g.fillStyle = "rgba(9,20,32,.92)";  g.fillRect(24, 24, W - 48, H - 48);
g.strokeStyle = "rgba(120,190,255,.18)"; g.lineWidth = 1;
g.strokeRect(24.5, 24.5, W - 49, H - 49);

order.forEach((id, i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  const x = 40 + col * CELL_W, y = 46 + row * CELL_H;
  const cw = CELL_W - 14, ch = CELL_H - 16;

  g.fillStyle = "rgba(0,0,0,.32)"; g.fillRect(x, y, cw, ch);
  g.strokeStyle = "rgba(120,190,255,.18)"; g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);

  const sp = SPRITES[id];
  const rd = G.RANKS.filter(r => r.key === id)[0];
  if (sp) {
    // buildCodex backs each cell at sprite*ZOOM and shrinks it by CSS via style
    const dw = sp.w * ZOOM * CSS, dh = sp.h * ZOOM * CSS;
    g.drawImage(sp.canvas, x + (cw - dw) / 2, y + 10, dw, dh);
  }
  // caption bar (the real panel uses fillText; here it is a swatch so the
  // screenshot still shows which slot is which)
  g.fillStyle = rd ? "rgba(90,209,255,.55)" : "rgba(126,156,181,.45)";
  g.fillRect(x + 10, y + ch - 20, Math.min(cw - 20, (sp ? sp.w * 3 : 0) + 18), 3);
});

const path = join(outDir, "05-bestiary.png");
writePNG(path, cv.width, cv.height, cv._buf);
console.log(`wrote ${path}  (${order.length} sprites)`);
