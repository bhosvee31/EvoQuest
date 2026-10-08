// Development harness for EvoQuest: boots index.html's game script inside a
// stubbed DOM and, optionally, with a software rasteriser so real frames can
// be written out as PNGs.
//
//   node tools\snapshot.mjs        -> renders a few game frames to PNG
//   node tools\headless-test.mjs   -> uses boot() for the rule tests
//
// Not shipped with the game.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));

/* ================================================================== PNG out */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
export function writePNG(path, width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]));
  return path;
}

/* ============================================================ software canvas */
function parseColor(c) {
  if (typeof c !== "string") return [0, 0, 0, 255];
  c = c.trim();
  if (c[0] === "#") {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16), 255];
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map(Number);
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255];
  }
  return [255, 255, 255, 255];
}

class CanvasElement {
  constructor(w = 300, h = 150) {
    this.tagName = "CANVAS";
    this.style = {}; this.dataset = {}; this.className = "";
    this._w = w | 0; this._h = h | 0;
    this._alloc();
  }
  get width() { return this._w; }
  set width(v) { this._w = v | 0; this._alloc(); }
  get height() { return this._h; }
  set height(v) { this._h = v | 0; this._alloc(); }
  _alloc() { this._buf = new Uint8ClampedArray(Math.max(1, this._w) * Math.max(1, this._h) * 4); }
  getContext() { if (!this._ctx) this._ctx = new SoftCtx(this); return this._ctx; }
  addEventListener() {} removeEventListener() {}
}
CanvasElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: this._w, height: this._h };
};

class SoftCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.fillStyle = "#000"; this.strokeStyle = "#000"; this.lineWidth = 1;
    this.globalAlpha = 1; this.font = ""; this.textAlign = "left";
    this.imageSmoothingEnabled = false; this.pixelOffsetMode = 0;
    this._subs = []; this._pts = []; this._cur = null;
  }
  get buf() { return this.canvas._buf; }
  get W() { return this.canvas._w; }
  get H() { return this.canvas._h; }

  save() {
    this.stack.push({ m: this.m.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, font: this.font, textAlign: this.textAlign });
  }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.m = s.m; this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth; this.globalAlpha = s.globalAlpha; this.font = s.font; this.textAlign = s.textAlign;
  }
  translate(x, y) { this.m[4] += this.m[0] * x + this.m[2] * y; this.m[5] += this.m[1] * x + this.m[3] * y; }
  scale(x, y) { this.m[0] *= x; this.m[1] *= x; this.m[2] *= y; this.m[3] *= y; }
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
  transform(a, b, c, d, e, f) {
    const m = this.m;
    this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d,
              m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
  }
  _pt(x, y) { return [this.m[0] * x + this.m[2] * y + this.m[4], this.m[1] * x + this.m[3] * y + this.m[5]]; }

  // a is normalised 0..1
  _blend(i, r, g, b, a) {
    const buf = this.buf;
    if (a <= 0) return;
    if (a >= 1) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; return; }
    const da = buf[i + 3] / 255;
    const na = a + da * (1 - a);
    if (na <= 0) { buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0; return; }
    buf[i]     = (r * a + buf[i]     * da * (1 - a)) / na;
    buf[i + 1] = (g * a + buf[i + 1] * da * (1 - a)) / na;
    buf[i + 2] = (b * a + buf[i + 2] * da * (1 - a)) / na;
    buf[i + 3] = na * 255;
  }
  _px(x, y, rgb, alpha) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    this._blend((y * this.W + x) * 4, rgb[0], rgb[1], rgb[2], alpha * (rgb[3] / 255));
  }

  clearRect(x, y, w, h) {
    const a = this._pt(x, y), b = this._pt(x + w, y + h);
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]))), x1 = Math.min(this.W, Math.ceil(Math.max(a[0], b[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]))), y1 = Math.min(this.H, Math.ceil(Math.max(a[1], b[1])));
    const buf = this.buf;
    for (let yy = y0; yy < y1; yy++) buf.fill(0, (yy * this.W + x0) * 4, (yy * this.W + x1) * 4);
  }
  fillRect(x, y, w, h) {
    const rgb = parseColor(this.fillStyle);
    const a = this._pt(x, y), b = this._pt(x + w, y + h);
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]))), x1 = Math.min(this.W, Math.ceil(Math.max(a[0], b[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]))), y1 = Math.min(this.H, Math.ceil(Math.max(a[1], b[1])));
    const al = this.globalAlpha;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this._px(xx, yy, rgb, al);
  }
  strokeRect(x, y, w, h) {
    const rgb = parseColor(this.strokeStyle), al = this.globalAlpha, t = Math.max(1, this.lineWidth);
    const a = this._pt(x, y), b = this._pt(x + w, y + h);
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
    const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    for (let k = 0; k < t; k++) {
      for (let xx = Math.floor(x0); xx <= Math.ceil(x1); xx++) { this._px(xx, y0 + k, rgb, al); this._px(xx, y1 - k, rgb, al); }
      for (let yy = Math.floor(y0); yy <= Math.ceil(y1); yy++) { this._px(x0 + k, yy, rgb, al); this._px(x1 - k, yy, rgb, al); }
    }
  }

  beginPath() { this._subs = []; this._cur = null; this._pts = []; }
  moveTo(x, y) { this._cur = { pts: [this._pt(x, y)] }; this._subs.push(this._cur); }
  lineTo(x, y) { if (!this._cur) this.moveTo(x, y); else this._cur.pts.push(this._pt(x, y)); }
  closePath() {}
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this._cur.closed = true; }
  arc(cx, cy, r) { this._subs.push({ ellipse: [this._pt(cx, cy), Math.abs(r * this.m[0]), Math.abs(r * this.m[3])] }); }
  ellipse(cx, cy, rx, ry) { this._subs.push({ ellipse: [this._pt(cx, cy), Math.abs(rx * this.m[0]), Math.abs(ry * this.m[3])] }); }
  fill() {
    const rgb = parseColor(this.fillStyle), al = this.globalAlpha;
    for (const s of this._subs) {
      if (s.ellipse) {
        const [[cx, cy], rx, ry] = s.ellipse;
        if (rx < 0.3 || ry < 0.3) continue;
        const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(this.W - 1, Math.ceil(cx + rx));
        const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.H - 1, Math.ceil(cy + ry));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
          if (u * u + v * v <= 1) this._px(x, y, rgb, al);
        }
      } else if (s.pts) {
        for (const [px, py] of s.pts) this._px(px, py, rgb, al);
      }
    }
  }
  stroke() {
    const rgb = parseColor(this.strokeStyle), al = this.globalAlpha;
    const t = Math.max(1, Math.round(this.lineWidth));
    for (const s of this._subs) {
      if (s.ellipse) {
        const [[cx, cy], rx, ry] = s.ellipse;
        const outer = 1 + t / Math.max(rx, ry);
        const inner = Math.max(0, 1 - t / Math.max(rx, ry));
        const x0 = Math.max(0, Math.floor(cx - rx * outer)), x1 = Math.min(this.W - 1, Math.ceil(cx + rx * outer));
        const y0 = Math.max(0, Math.floor(cy - ry * outer)), y1 = Math.min(this.H - 1, Math.ceil(cy + ry * outer));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
          const d = Math.sqrt(u * u + v * v);
          if (d <= outer && d >= inner) this._px(x, y, rgb, al);
        }
        continue;
      }
      if (!s.pts || s.pts.length < 2) continue;
      for (let i = 0; i + 1 < s.pts.length; i++) this._line(s.pts[i], s.pts[i + 1], rgb, al, t);
    }
  }
  _line([x0, y0], [x1, y1], rgb, al, t) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const off = (t - 1) / 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * (s / steps), y = y0 + (y1 - y0) * (s / steps);
      for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < t; dx++)
        this._px(x - off + dx, y - off + dy, rgb, al);
    }
  }

  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  getImageData(x, y, w, h) {
    const out = this.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const sx = x + i, sy = y + j;
      if (sx < 0 || sy < 0 || sx >= this.W || sy >= this.H) continue;
      const s = (sy * this.W + sx) * 4, d = (j * w + i) * 4;
      out.data[d] = this.buf[s]; out.data[d + 1] = this.buf[s + 1];
      out.data[d + 2] = this.buf[s + 2]; out.data[d + 3] = this.buf[s + 3];
    }
    return out;
  }
  putImageData(img, dx, dy) {
    for (let j = 0; j < img.height; j++) {
      const ty = dy + j; if (ty < 0 || ty >= this.H) continue;
      for (let i = 0; i < img.width; i++) {
        const tx = dx + i; if (tx < 0 || tx >= this.W) continue;
        const s = (j * img.width + i) * 4, d = (ty * this.W + tx) * 4;
        this.buf[d] = img.data[s]; this.buf[d + 1] = img.data[s + 1];
        this.buf[d + 2] = img.data[s + 2]; this.buf[d + 3] = img.data[s + 3];
      }
    }
  }

  drawImage(img, dx, dy, dw, dh) {
    if (!img || !img._buf) return;
    if (dw === undefined) { dw = img._w; dh = img._h; }
    const a = this._pt(dx, dy), b = this._pt(dx + dw, dy + dh);
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
    const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    const tw = Math.abs(b[0] - a[0]), th = Math.abs(b[1] - a[1]);
    if (tw < 0.5 || th < 0.5) return;
    const al = this.globalAlpha;
    const ix0 = Math.max(0, Math.floor(x0)), ix1 = Math.min(this.W - 1, Math.ceil(x1));
    const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(this.H - 1, Math.ceil(y1));
    const sw = img._w, sh = img._h;
    for (let y = iy0; y <= iy1; y++) {
      const v = ((y + 0.5 - y0) / th) * sh;
      if (v < 0 || v >= sh) continue;
      const sy = v | 0;
      for (let x = ix0; x <= ix1; x++) {
        const u = ((x + 0.5 - x0) / tw) * sw;
        if (u < 0 || u >= sw) continue;
        const s = (sy * sw + (u | 0)) * 4;
        const sa = img._buf[s + 3];
        if (sa === 0) continue;
        this._blend((y * this.W + x) * 4, img._buf[s], img._buf[s + 1], img._buf[s + 2], (sa / 255) * al);
      }
    }
  }

  measureText(t) { return { width: String(t).length * 6 }; }
  fillText() {} strokeText() {} clip() {} rotate() {} arcTo() {} quadraticCurveTo() {} bezierCurveTo() {}
  createPattern() { return null; } createLinearGradient() { return { addColorStop() {} }; }
  putImageDataTo() {}
}

/* =================================================================== DOM stub */
function makeEl(tag) {
  const name = String(tag).toLowerCase();
  if (name === "canvas") return new CanvasElement();
  const el = {
    tagName: name.toUpperCase(), style: {}, dataset: {}, className: "",
    children: [], width: 300, height: 150, _text: "", _html: "",
    getContext: () => ({ canvas: el }), addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    setAttribute() {}, getAttribute: () => null, querySelectorAll: () => [],
    focus() {}, click() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
    get firstChild() { return el.children[0] || null; },
    get textContent() { return el._text; }, set textContent(v) { el._text = String(v); },
    get innerHTML() { return el._html; }, set innerHTML(v) { el._html = String(v); }
  };
  el.classList = {
    _s: new Set(),
    add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
    contains(c) { return this._s.has(c); },
    toggle(c, force) { const on = force === undefined ? !this._s.has(c) : !!force; on ? this._s.add(c) : this._s.delete(c); return on; }
  };
  return el;
}

/* ====================================================================== boot */
export function boot(opts = {}) {
  const width = opts.width || 1280, height = opts.height || 800;
  const html = opts.html || readFileSync(join(here, "..", "index.html"), "utf8");

  const blocks = [];
  const rx = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = rx.exec(html))) blocks.push({ attrs: m[1], body: m[2] });
  const jsonBlock = blocks.find(b => /sprites-data/.test(b.attrs));
  const gameBlock = blocks.find(b => !/sprites-data/.test(b.attrs));
  if (!jsonBlock || !gameBlock) throw new Error("could not find the sprite + game script blocks");

  const elements = new Map();
  const CANVAS_IDS = new Set(["game", "mini", "portrait"]);
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, CANVAS_IDS.has(id) ? new CanvasElement() : makeEl("div"));
    return elements.get(id);
  };
  const rafQueue = [];
  const listeners = { window: {}, document: {} };

  // In-memory localStorage, so profile save/load can actually be tested.
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; }
  };

  // A real monotonic clock. The game rate-limits net sends on performance.now();
  // stubbing it to a constant would stall every send permanently.
  const clock = { t: 0, now: () => (clock.t += 16.7) };

  const sandbox = {
    console, Math, JSON, Date, Uint8ClampedArray, Object, Array, String, Number, Boolean,
    isNaN, parseInt, parseFloat, Int32Array, Uint8Array,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    devicePixelRatio: 1, innerWidth: width, innerHeight: height,
    AudioContext: undefined,
    Blob: class {}, URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
    document: {
      getElementById: byId,
      createElement: makeEl,
      addEventListener(t, f) { (listeners.document[t] ||= []).push(f); },
      body: makeEl("body")
    },
    performance: clock,
    localStorage,
    __store: store
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = (t, f) => { (listeners.window[t] ||= []).push(f); };
  sandbox.window.removeEventListener = () => {};
  sandbox.window.devicePixelRatio = 1;
  sandbox.window.innerWidth = width;
  sandbox.window.innerHeight = height;
  sandbox.window.AudioContext = undefined;

  vm.createContext(sandbox);
  byId("sprites-data").textContent = jsonBlock.body;
  new vm.Script(gameBlock.body, { filename: "evoquest-game.js" }).runInContext(sandbox);

  const G = sandbox.window.EvoQuest;
  if (!G) throw new Error("window.EvoQuest was not exported");

  return { sandbox, G, byId, elements, rafQueue, listeners, width, height };
}

/** Run one real animation frame (update + render) at the given timestamp. */
export function pumpFrame(ctx, ts) {
  const fn = ctx.rafQueue.pop();
  if (fn) fn(ts);
}

export { join as _join, here as _here };
