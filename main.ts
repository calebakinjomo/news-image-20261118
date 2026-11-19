// The World in One Picture — Wednesday 18 November 2026.
// A newspaper front page drawn entirely in code: own PNG encoder,
// own 5x7 bitmap font, own vector shapes. No assets, no network,
// no randomness, no clock: two runs produce byte-identical bytes.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;

// Palette indices (PNG colour type 3, 8-bit indices).
const PAPER = 0; // cream newsprint
const INK = 1; // near-black ink
const RED = 2; // accent red
const BLUE = 3; // deep blue
const GOLD = 4; // gold
const GREY = 5; // mid grey
const RULE = 6; // light rule grey
const GREEN = 7; // green
const SKY = 8; // pale sky blue
const WHITE = 9; // white
const NAVY = 10; // dark navy (skyline)
const ORANGE = 11; // orange

const PALETTE: Array<[number, number, number]> = [
  [248, 243, 230], // 0 PAPER
  [27, 27, 27], // 1 INK
  [179, 39, 30], // 2 RED
  [31, 78, 121], // 3 BLUE
  [201, 162, 39], // 4 GOLD
  [107, 107, 107], // 5 GREY
  [216, 210, 192], // 6 RULE
  [46, 107, 52], // 7 GREEN
  [191, 217, 234], // 8 SKY
  [255, 255, 255], // 9 WHITE
  [22, 50, 79], // 10 NAVY
  [217, 123, 41], // 11 ORANGE
];

const px = new Uint8Array(W * H);
px.fill(PAPER);

function setPx(x: number, y: number, c: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  px[y * W + x] = c;
}

function fillRect(x: number, y: number, w: number, h: number, c: number): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    const base = yy * W;
    for (let xx = x0; xx < x1; xx++) px[base + xx] = c;
  }
}

function hline(x: number, y: number, w: number, c: number): void {
  fillRect(x, y, w, 1, c);
}
function vline(x: number, y: number, h: number, c: number): void {
  fillRect(x, y, 1, h, c);
}
function rect(x: number, y: number, w: number, h: number, c: number): void {
  hline(x, y, w, c);
  hline(x, y + h - 1, w, c);
  vline(x, y, h, c);
  vline(x + w - 1, y, h, c);
}

// Bresenham line.
function line(x0: number, y0: number, x1: number, y1: number, c: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function circle(cx: number, cy: number, r: number, c: number): void {
  // Filled circle by horizontal scanlines.
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    hline(cx - half, cy + dy, half * 2 + 1, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: number): void {
  let x = 0;
  let y = r;
  let d = 3 - 2 * r;
  const plot = (ox: number, oy: number): void => {
    setPx(cx + ox, cy + oy, c);
    setPx(cx - ox, cy + oy, c);
    setPx(cx + ox, cy - oy, c);
    setPx(cx - ox, cy - oy, c);
    setPx(cx + oy, cy + ox, c);
    setPx(cx - oy, cy + ox, c);
    setPx(cx + oy, cy - ox, c);
    setPx(cx - oy, cy - ox, c);
  };
  while (y >= x) {
    plot(x, y);
    x++;
    if (d > 0) {
      y--;
      d = d + 4 * (x - y) + 10;
    } else {
      d = d + 4 * x + 6;
    }
  }
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, c: number): void {
  // Arc drawn by stepping angle in fixed increments (deterministic).
  const steps = Math.max(8, Math.floor(r * 2));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    setPx(Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), c);
  }
}

function fillTriangle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  c: number,
): void {
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(H - 1, Math.max(y0, y1, y2));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.max(0, Math.floor(Math.min(xs[0], xs[1])));
      const hi = Math.min(W - 1, Math.ceil(Math.max(xs[0], xs[1])));
      hline(lo, y, hi - lo + 1, c);
    }
  }
}

// ---------------------------------------------------------------- font
// 5x7 bitmap font, one row per number, bit 4 = leftmost pixel.
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x10, 0x0e],
  d: [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x08, 0x08, 0x1e, 0x08, 0x08, 0x08],
  g: [0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  h: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x15, 0x15],
  n: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x1e, 0x10],
  q: [0x00, 0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1e, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  ";": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "-": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "+": [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  "=": [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  '"': [0x0a, 0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00],
  "*": [0x00, 0x04, 0x15, 0x0e, 0x15, 0x04, 0x00],
};

const CHAR_W = 6; // 5 pixels + 1 pixel spacing, times scale

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * CHAR_W * scale - scale;
}

function drawText(x: number, y: number, text: string, scale: number, c: number): void {
  let cx = x;
  for (const ch of text) {
    const g = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      const bits = g[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += CHAR_W * scale;
  }
}

function drawTextCentred(cx: number, y: number, text: string, scale: number, c: number): void {
  drawText(cx - Math.floor(textWidth(text, scale) / 2), y, text, scale, c);
}

// Greedy word wrap. Returns lines that fit maxWidth at this scale.
function wrapText(text: string, scale: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawWrapped(
  x: number,
  y: number,
  text: string,
  scale: number,
  maxWidth: number,
  lineH: number,
  c: number,
): number {
  const lines = wrapText(text, scale, maxWidth);
  for (let i = 0; i < lines.length; i++) {
    drawText(x, y + i * lineH, lines[i], scale, c);
  }
  return y + lines.length * lineH;
}

// ---------------------------------------------------------------- illustrations
function drawFlagPole(x: number, baseY: number, h: number): void {
  vline(x, baseY - h, h, INK);
  fillRect(x - 1, baseY - h, 3, h, INK);
}

function drawUsFlag(x: number, y: number, w: number, h: number): void {
  // Thirteen stripes, blue canton with a star field suggested by dots.
  const stripe = Math.max(1, Math.floor(h / 13));
  for (let i = 0; i < 13; i++) {
    fillRect(x, y + i * stripe, w, stripe, i % 2 === 0 ? RED : WHITE);
  }
  fillRect(x, y, Math.floor(w * 0.4), stripe * 7, BLUE);
  for (let r = 0; r < 4; r++) {
    for (let cIdx = 0; cIdx < 4; cIdx++) {
      setPx(x + 3 + cIdx * 4, y + 2 + r * 3, WHITE);
    }
  }
}

function drawChinaFlag(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, RED);
  // One large star (5-point, drawn as a small starburst) + four small ones.
  const star = (sx: number, sy: number, r: number): void => {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      line(sx, sy, Math.round(sx + r * Math.cos(a)), Math.round(sy + r * Math.sin(a)), GOLD);
    }
    circle(sx, sy, 1, GOLD);
  };
  star(x + 9, y + 8, 6);
  star(x + 20, y + 4, 2);
  star(x + 24, y + 8, 2);
  star(x + 24, y + 13, 2);
  star(x + 20, y + 17, 2);
}

function drawRussiaFlag(x: number, y: number, w: number, h: number): void {
  const third = Math.max(1, Math.floor(h / 3));
  fillRect(x, y, w, third, WHITE);
  fillRect(x, y + third, w, third, BLUE);
  fillRect(x, y + 2 * third, w, h - 2 * third, RED);
}

function drawSkyline(x: number, y: number, w: number, h: number): void {
  // Dark navy towers with lit windows, rising from the bottom of the band.
  const towers: Array<[number, number, number]> = [
    [0, 62, 34],
    [40, 88, 26],
    [72, 52, 30],
    [108, 104, 24],
    [138, 70, 34],
    [178, 96, 26],
    [210, 58, 30],
    [246, 84, 26],
    [278, 66, 32],
    [316, 100, 24],
    [346, 72, 30],
    [382, 92, 26],
    [414, 60, 32],
    [452, 86, 26],
    [484, 68, 30],
    [520, 98, 24],
    [550, 74, 32],
    [588, 90, 26],
    [620, 64, 30],
    [656, 96, 26],
    [688, 70, 32],
    [726, 88, 26],
    [758, 62, 30],
    [794, 94, 26],
    [826, 66, 32],
    [864, 84, 28],
    [898, 60, 30],
    [934, 78, 34],
  ];
  for (const [tx, th, tw] of towers) {
    const bx = x + tx;
    const by = y + h - th;
    fillRect(bx, by, tw, th, NAVY);
    // Antenna on the tallest towers.
    if (th >= 96) vline(bx + Math.floor(tw / 2), by - 10, 10, NAVY);
    // Lit windows: fixed pattern, deterministic.
    for (let wy = by + 6; wy < y + h - 6; wy += 12) {
      for (let wx = bx + 5; wx < bx + tw - 5; wx += 10) {
        if (((wx * 7 + wy * 13) % 5) < 2) fillRect(wx, wy, 3, 4, GOLD);
      }
    }
  }
  // Ground line.
  hline(x, y + h - 1, w, NAVY);
}

function drawLeadIllustration(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  rect(x, y, w, h, INK);
  // Sun, top right.
  circle(x + w - 70, y + 34, 22, GOLD);
  circleOutline(x + w - 70, y + 34, 22, INK);
  // Skyline along the bottom.
  drawSkyline(x + 8, y + h - 78, w - 16, 78);
  // Three flags on poles rising above the skyline.
  const flagW = 74;
  const flagH = 46;
  const poleBase = y + h - 8;
  const poleH = 128;
  const centres = [0.2, 0.5, 0.8];
  const labels = ["UNITED STATES", "CHINA", "RUSSIA"];
  for (let i = 0; i < 3; i++) {
    const cx = Math.round(x + w * centres[i]);
    drawFlagPole(cx, poleBase, poleH);
    const fx = cx + 2;
    const fy = poleBase - poleH + 4;
    if (i === 0) drawUsFlag(fx, fy, flagW, flagH);
    else if (i === 1) drawChinaFlag(fx, fy, flagW, flagH);
    else drawRussiaFlag(fx, fy, flagW, flagH);
    rect(fx, fy, flagW, flagH, INK);
    // Caption plate in paper colour so the label stays readable over the towers.
    const labelW = textWidth(labels[i], 2);
    const lx = Math.round(cx + flagW / 2 + 2 - labelW / 2);
    const ly = fy + flagH + 5;
    fillRect(lx - 3, ly - 2, labelW + 6, 18, PAPER);
    drawText(lx, ly, labels[i], 2, INK);
  }
}

function drawBurst(cx: number, cy: number, r: number, c: number): void {
  // Starburst: 8 spikes from the centre.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    line(cx, cy, Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), c);
  }
  circle(cx, cy, Math.max(2, Math.floor(r / 3)), c);
}

function drawGulfIcon(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  rect(x, y, w, h, INK);
  const seaH = Math.max(18, Math.floor(h * 0.28));
  const seaY = y + h - seaH;
  // Missile streaking down at the top left, with a smoke trail.
  const mEndX = x + 38;
  const mEndY = y + Math.min(24, Math.max(10, seaY - y - 20));
  line(x + 10, y + 4, mEndX, mEndY, INK);
  line(x + 13, y + 3, mEndX + 2, mEndY - 2, GREY);
  fillTriangle(mEndX, mEndY, mEndX - 8, mEndY + 3, mEndX - 2, mEndY + 9, INK);
  drawBurst(mEndX + 2, mEndY + 10, 7, RED);
  // Oil tanker on the sea.
  fillRect(x, seaY, w, seaH, BLUE);
  const hullY = seaY - 12;
  fillRect(x + 14, hullY, w - 28, 12, NAVY);
  fillRect(x + 20, hullY - 9, 16, 9, RED);
  fillRect(x + 40, hullY - 9, 16, 9, GOLD);
  fillRect(x + 60, hullY - 9, 16, 9, WHITE);
  fillRect(x + 80, hullY - 9, 16, 9, RED);
  // Waves.
  for (let wx = x + 8; wx < x + w - 8; wx += 18) {
    arc(wx + 8, seaY + Math.floor(seaH / 2), 6, Math.PI, 2 * Math.PI, WHITE);
  }
  drawText(x + 6, y + h - 15, "OIL $93", 2, WHITE);
}

function drawBridgeIcon(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  rect(x, y, w, h, INK);
  const waterH = Math.max(14, Math.floor(h * 0.22));
  const waterY = y + h - waterH;
  fillRect(x, waterY, w, waterH, BLUE);
  const deckY = y + Math.floor((waterY - y) * 0.5);
  // Two towers.
  const tx1 = x + 20;
  const tx2 = x + w - 26;
  fillRect(tx1, y + 8, 6, waterY - y - 8, INK);
  fillRect(tx2, y + 8, 6, waterY - y - 8, INK);
  // Cables.
  line(tx1 + 3, y + 8, x + Math.floor(w / 2) - 14, deckY, INK);
  line(tx2 + 3, y + 8, x + Math.floor(w / 2) + 14, deckY, INK);
  // Deck: intact on both sides, collapsed in the middle.
  hline(x + 4, deckY, 40, INK);
  hline(x + w - 44, deckY, 40, INK);
  const dropY = Math.min(deckY + 12, waterY - 2);
  line(x + 44, deckY, x + Math.floor(w / 2) - 6, dropY, INK);
  line(x + w - 44, deckY, x + Math.floor(w / 2) + 6, dropY, INK);
  drawBurst(x + Math.floor(w / 2), deckY - 4, 7, RED);
  // Ripples where the span fell.
  arc(x + Math.floor(w / 2), waterY + 4, 8, 0, Math.PI, WHITE);
}

function drawCycloneIcon(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  rect(x, y, w, h, INK);
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2) - 2;
  // Spiral: arcs of growing radius, each a little further round.
  const rMax = Math.min(30, Math.floor(h / 2) - 6);
  for (let r = 5; r <= rMax; r += 5) {
    arc(cx, cy, r, (r * Math.PI) / 16, (r * Math.PI) / 16 + Math.PI * 1.5, INK);
  }
  circle(cx, cy, 3, RED);
  // Rain streaks at the bottom.
  for (let i = 0; i < 4; i++) {
    const rx = x + 10 + i * 26;
    line(rx, y + h - 20, rx - 5, y + h - 9, BLUE);
  }
}

function drawBallotIcon(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER);
  rect(x, y, w, h, INK);
  const cx = x + Math.floor(w / 2);
  // Star above the box.
  drawBurst(cx, y + 10, 6, GOLD);
  // Ballot paper going into the slot, with a tick.
  fillRect(cx - 10, y + 17, 20, 12, WHITE);
  rect(cx - 10, y + 17, 20, 12, INK);
  line(cx - 5, y + 25, cx - 1, y + 28, GREEN);
  line(cx - 1, y + 28, cx + 6, y + 21, GREEN);
  // The box.
  const boxY = y + 31;
  const boxH = h - 37;
  fillRect(x + 12, boxY, w - 24, boxH, BLUE);
  rect(x + 12, boxY, w - 24, boxH, INK);
  fillRect(cx - 14, boxY, 28, 3, INK);
  drawTextCentred(cx, boxY + Math.floor(boxH / 2) - 7, "56-44", 2, WHITE);
}

function drawChipIcon(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER);
  rect(x, y, w, h, INK);
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  const s = Math.min(28, Math.floor(h / 2) - 12);
  // Pins on all four sides.
  for (let i = -2; i <= 2; i++) {
    fillRect(cx + i * 11 - 2, cy - s - 8, 4, 8, INK);
    fillRect(cx + i * 11 - 2, cy + s, 4, 8, INK);
    fillRect(cx - s - 8, cy + i * 11 - 2, 8, 4, INK);
    fillRect(cx + s, cy + i * 11 - 2, 8, 4, INK);
  }
  // Chip body and die.
  fillRect(cx - s, cy - s, s * 2, s * 2, NAVY);
  rect(cx - s, cy - s, s * 2, s * 2, INK);
  const d = Math.floor(s * 0.6);
  fillRect(cx - d, cy - d, d * 2, d * 2, GREEN);
  rect(cx - d, cy - d, d * 2, d * 2, INK);
  drawTextCentred(cx, cy - 7, "AI", 2, WHITE);
  // Circuit traces to the corners.
  line(cx - s, cy - s, x + 5, y + 5, GOLD);
  line(cx + s, cy - s, x + w - 5, y + 5, GOLD);
  line(cx - s, cy + s, x + 5, y + h - 5, GOLD);
  line(cx + s, cy + s, x + w - 5, y + h - 5, GOLD);
}

// ---------------------------------------------------------------- layout
const M = 28; // page margin
const CW = W - 2 * M; // content width = 968

function rule(y: number): void {
  hline(M, y, CW, INK);
  hline(M, y + 4, CW, INK);
}

function drawMasthead(): void {
  rule(20);
  drawTextCentred(W / 2, 34, "THE WORLD IN ONE PICTURE", 6, INK);
  drawTextCentred(W / 2, 88, "WEDNESDAY 18 NOVEMBER 2026", 3, RED);
  rule(116);
}

function drawLead(): void {
  // Kicker.
  drawText(M, 134, "LEAD STORY  *  APEC SUMMIT IN SHENZHEN", 2, RED);
  // Headline, two lines.
  drawText(M, 162, "TRUMP LANDS IN SHENZHEN", 5, INK);
  drawText(M, 206, "AS XI GREETS HIM AT AIRPORT", 5, INK);
  // Illustration band.
  drawLeadIllustration(M, 254, CW, 158);
  // Summary, two lines of wrapped text.
  drawWrapped(
    M,
    424,
    "Donald Trump arrived in Shenzhen for the APEC summit, greeted personally at the airport by China's Xi Jinping. A first-ever trilateral summit of Trump, Xi and Vladimir Putin is set for Thursday.",
    2,
    CW,
    19,
    INK,
  );
}

// One full-width story row: headline + wrapped summary on the left,
// a drawn icon in a box on the right. Row height is chosen by the caller
// to fit the headline and summary lines exactly.
function drawStoryRow(
  x: number,
  y: number,
  w: number,
  rowH: number,
  headline: string,
  summary: string,
  icon: (ix: number, iy: number, iw: number, ih: number) => void,
): void {
  const iconW = 120;
  const textW = w - iconW - 14;
  const headLines = wrapText(headline, 3, textW);
  let hy = y;
  for (const hl of headLines) {
    drawText(x, hy, hl, 3, INK);
    hy += 26;
  }
  drawWrapped(x, hy + 4, summary, 2, textW, 18, INK);
  icon(x + textW + 14, y + 2, iconW, rowH - 4);
}

function drawSecondary(): void {
  hline(M, 486, CW, RULE);
  let y = 494;
  drawStoryRow(
    M,
    y,
    CW,
    130,
    "US STRIKES IRAN IN THE GULF AS IRAN HITS US BASE IN KUWAIT",
    "Washington struck Qeshm Island in the Strait of Hormuz. Iranian drones hit US Patriot and missile platforms at Ali Al Salem Air Base in Kuwait. Bahrain said its defences intercepted attacks, and an ADNOC ship was hit, one crew member missing. Oil near $93 a barrel.",
    drawGulfIcon,
  );
  y += 130;
  hline(M, y + 3, CW, RULE);
  y += 10;
  drawStoryRow(
    M,
    y,
    CW,
    70,
    "UKRAINE HITS KERCH BRIDGE AGAIN",
    "Kyiv struck the Crimean bridge for a second day running. Part of the road span collapsed into the strait below.",
    drawBridgeIcon,
  );
  y += 70;
  hline(M, y + 3, CW, RULE);
  y += 10;
  drawStoryRow(
    M,
    y,
    CW,
    70,
    "CYCLONE AKVAN BEARS DOWN ON INDIA",
    "The severe cyclonic storm heads for Odisha and Andhra Pradesh. Mass evacuations are under way and schools are shut.",
    drawCycloneIcon,
  );
  y += 70;
  hline(M, y + 3, CW, RULE);
  y += 10;
  drawStoryRow(
    M,
    y,
    CW,
    88,
    "PELTOLA WINS ALASKA SENATE SEAT",
    "Democrat Mary Peltola beat Republican Dan Sullivan 50% to 46%. Democrats take a 56-44 Senate majority, their largest since 2009. Peltola is the first Alaska Native elected to the Senate.",
    drawBallotIcon,
  );
  y += 88;
  hline(M, y + 3, CW, RULE);
  y += 10;
  drawStoryRow(
    M,
    y,
    CW,
    70,
    "NVIDIA BOARD REJECTS HUANG RETURN",
    "Nvidia's board turned down Jensen Huang's return as chief executive, despite a record $115.8 billion quarter.",
    drawChipIcon,
  );
}

function drawFooter(): void {
  rule(968);
  drawTextCentred(
    W / 2,
    982,
    "WEDNESDAY 18 NOVEMBER 2026  *  make.fun news-image-20261118",
    2,
    GREY,
  );
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(): Buffer {
  // IHDR: 1024x1024, 8-bit, colour type 3 (palette).
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const plte = Buffer.alloc(PALETTE.length * 3);
  for (let i = 0; i < PALETTE.length; i++) {
    plte[i * 3] = PALETTE[i][0];
    plte[i * 3 + 1] = PALETTE[i][1];
    plte[i * 3 + 2] = PALETTE[i][2];
  }

  // Scanlines: pick the best of filters 0 (None), 1 (Sub), 2 (Up) per row
  // by the sum of absolute signed byte values. Fully deterministic.
  const raw = Buffer.alloc(H * (1 + W));
  const prev = new Uint8Array(W);
  for (let y = 0; y < H; y++) {
    const row = px.subarray(y * W, (y + 1) * W);
    let bestFilter = 0;
    let bestScore = Infinity;
    let bestRow = Buffer.alloc(W);
    for (let f = 0; f <= 2; f++) {
      const filtered = Buffer.alloc(W);
      let score = 0;
      for (let x = 0; x < W; x++) {
        let v: number;
        if (f === 0) v = row[x];
        else if (f === 1) v = row[x] - (x > 0 ? row[x - 1] : 0);
        else v = row[x] - prev[x];
        const b = v & 0xff;
        filtered[x] = b;
        score += Math.abs(b < 128 ? b : b - 256);
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = f;
        bestRow = filtered;
      }
    }
    raw[y * (1 + W)] = bestFilter;
    bestRow.copy(raw, y * (1 + W) + 1);
    prev.set(row);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- main
function main(): void {
  drawMasthead();
  drawLead();
  drawSecondary();
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  const png = encodePng();
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();
