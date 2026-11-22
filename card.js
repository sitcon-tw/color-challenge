"use strict";

// Draws the shareable result cards on a canvas, in the same tactical style as the result screen.
const CARD_WIDTH = 1080;
const CARD_LAYOUT = {
  // top: safe area for the Instagram header. s: scale of the debrief card contents.
  story: { height: 1920, top: 210, mapCy: 745, diameter: 660, gaugeY: 1180, cardY: 1255, s: 1, inviteY: 1768 },
  post: { height: 1350, top: 0, mapCy: 452, diameter: 440, gaugeY: 740, cardY: 805, s: 0.84, inviteY: 1250 },
};
const CARD_FONT = '"Inter", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
const CARD_MONO = '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace';
const PIN_GUESS = "#3ddc84";
const PIN_TARGET = "#ff4d4d";
const BLUE = "#38bdf8";
const BLUE_HOT = "#8be3ff";
const GOLD = "#ffdf79";

function wheelPoint({ hue, saturation }) {
  const angle = hue * Math.PI / 180;
  return { x: 50 + Math.sin(angle) * saturation * 50, y: 50 - Math.cos(angle) * saturation * 50 };
}

// Same "zoom to fit" rule as the on-screen reveal. Screen = 50 + k * (world - midpoint).
function fitZoom(guess, target) {
  const gap = Math.hypot(guess.x - target.x, guess.y - target.y);
  return gap < 45 ? Math.min(5, 45 / Math.max(gap, 1e-6)) : 1;
}

// Ease the camera toward the pair's midpoint as the zoom grows, so a slight zoom never shifts the view.
function fitFocus(mid, zoom) {
  const blend = Math.min(1, (zoom - 1) / 1.5);
  return { x: 50 + (mid.x - 50) * blend, y: 50 + (mid.y - 50) * blend };
}

function drawWheel(ctx, cx, cy, diameter, zoom, mid) {
  const radius = diameter / 2;
  const size = Math.ceil(diameter);
  const left = Math.round(cx - radius);
  const top = Math.round(cy - radius);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sx = (px + left - cx) / diameter * 100 + 50;
      const sy = (py + top - cy) / diameter * 100 + 50;
      const screenR = Math.hypot(sx - 50, sy - 50);
      if (screenR > 50) continue;
      const wx = mid.x + (sx - 50) / zoom - 50;
      const wy = mid.y + (sy - 50) / zoom - 50;
      const r = Math.hypot(wx, wy) / 50;
      const edge = Math.min(1, Math.max(0, (1 - r) * radius * zoom / 2));
      if (edge <= 0) continue;
      const hue = (Math.atan2(wx, -wy) * 180 / Math.PI + 360) % 360;
      const [red, green, blue] = hsvToRgb({ hue, saturation: Math.min(1, r), value: 158 });
      const at = (py * size + px) * 4;
      data[at] = red;
      data[at + 1] = green;
      data[at + 2] = blue;
      data[at + 3] = Math.round(255 * edge * Math.min(1, (50 - screenR) * radius / 50 * 2));
    }
  }
  const layer = document.createElement("canvas");
  layer.width = layer.height = size;
  layer.getContext("2d").putImageData(image, 0, 0);
  ctx.drawImage(layer, left, top);

  // Grid: crosshair and range rings, following the zoom.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  const toScreen = world => ({ x: cx + (50 + zoom * (world.x - mid.x) - 50) / 100 * diameter, y: cy + (50 + zoom * (world.y - mid.y) - 50) / 100 * diameter });
  const center = toScreen({ x: 50, y: 50 });
  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center.x, cy - radius);
  ctx.lineTo(center.x, cy + radius);
  ctx.moveTo(cx - radius, center.y);
  ctx.lineTo(cx + radius, center.y);
  ctx.stroke();
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, ring * radius * zoom, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0e1511";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  // Degree ticks around the dial.
  ctx.strokeStyle = "rgba(125,211,252,.7)";
  ctx.lineWidth = 3;
  for (let degree = 0; degree < 360; degree += 6) {
    const angle = degree * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(angle) * (radius + 10), cy - Math.cos(angle) * (radius + 10));
    ctx.lineTo(cx + Math.sin(angle) * (radius + (degree % 30 ? 17 : 24)), cy - Math.cos(angle) * (radius + (degree % 30 ? 17 : 24)));
    ctx.stroke();
  }
  return toScreen;
}

function drawPin(ctx, x, y, color, glow) {
  const r = 27;
  const centerY = y - r * 2.1;
  const phi = Math.acos(1 / 2.1);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = glow ? color : "rgba(0,0,0,.6)";
  ctx.shadowBlur = glow ? 30 : 12;
  ctx.shadowOffsetY = glow ? 0 : 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(Math.PI / 2 + phi) * r, centerY + Math.sin(Math.PI / 2 + phi) * r);
  ctx.arc(x, centerY, r, Math.PI / 2 + phi, Math.PI * 2 + Math.PI / 2 - phi);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0e1511";
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.arc(x, centerY, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawTag(ctx, text, x, y, size) {
  ctx.save();
  ctx.font = `700 ${size}px ${CARD_MONO}`;
  const width = ctx.measureText(text).width + size * 1.1;
  const height = size * 1.75;
  roundRect(ctx, x - width / 2, y - height, width, height, 10);
  ctx.fillStyle = "rgba(7,19,27,.88)";
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = BLUE_HOT;
  ctx.stroke();
  ctx.fillStyle = BLUE_HOT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - height / 2 + 2);
  ctx.restore();
}

function drawBackground(ctx, height) {
  ctx.fillStyle = "#151d18";
  ctx.fillRect(0, 0, CARD_WIDTH, height);
  ctx.fillStyle = "#2a372f";
  for (let y = 18; y < height; y += 36) {
    for (let x = 18; x < CARD_WIDTH; x += 36) ctx.fillRect(x, y, 3, 3);
  }
  const glow = ctx.createRadialGradient(540, height * 0.35, 80, 540, height * 0.35, 760);
  glow.addColorStop(0, "rgba(56,189,248,.14)");
  glow.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, height);
}

function makeScoreImage({ rgb, grade, displayed, mode, invitation, selection, score }, format, logo) {
  const layout = CARD_LAYOUT[format];
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  const text = (value, x, y, size, weight, color, { align = "left", family = CARD_FONT, max } = {}) => {
    ctx.save();
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y, max);
    ctx.restore();
  };

  drawBackground(ctx, layout.height);

  // Header
  const headTop = layout.top + (format === "story" ? 0 : 36);
  const logoHeight = 112;
  ctx.drawImage(logo, 72, headTop + 6, logoHeight * 193.6 / 261.6, logoHeight);
  text("SITCON 學生計算機年會", 190, headTop + 52, 36, 650, "#eef3ec");
  text("Color Challenge · 調出 SITCON 綠", 190, headTop + 104, 32, 500, "#9fc4d6");
  text("TARGET LOCK", 1008, headTop + 52, 30, 700, BLUE_HOT, { align: "right", family: CARD_MONO });

  // Map
  const guess = wheelPoint(selection);
  const target = wheelPoint(rgbToHsv(SITCON_GREEN));
  const mid = { x: (guess.x + target.x) / 2, y: (guess.y + target.y) / 2 };
  const zoom = fitZoom(guess, target);
  const cx = CARD_WIDTH / 2;
  const cy = layout.mapCy;
  const diameter = layout.diameter;
  const toScreen = drawWheel(ctx, cx, cy, diameter, zoom, fitFocus(mid, zoom));
  const from = toScreen(guess);
  const to = toScreen(target);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, diameter / 2 + 40, 0, Math.PI * 2);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 28;
  ctx.strokeStyle = "rgba(56,189,248,.55)";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "#e8fbff";
  ctx.lineWidth = 5;
  ctx.setLineDash([22, 14]);
  ctx.stroke();
  ctx.restore();

  drawPin(ctx, to.x, to.y, PIN_TARGET, true);
  drawPin(ctx, from.x, from.y, PIN_GUESS, false);
  drawTag(ctx, displayed.toFixed(1), (from.x + to.x) / 2, (from.y + to.y) / 2 - 24, 40);

  // Brightness gauge
  const targetValue = rgbToHsv(SITCON_GREEN).value;
  const guessValue = selection.value;
  const trackLeft = 190;
  const trackWidth = 818;
  const trackY = layout.gaugeY;
  const gradient = ctx.createLinearGradient(trackLeft, 0, trackLeft + trackWidth, 0);
  gradient.addColorStop(0, "#000");
  gradient.addColorStop(1, "#fff");
  roundRect(ctx, trackLeft, trackY - 10, trackWidth, 20, 10);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#87958a";
  ctx.stroke();
  text("明度", 72, trackY + 10, 30, 600, "#9fc4d6");
  const guessX = trackLeft + guessValue / 255 * trackWidth;
  const targetX = trackLeft + targetValue / 255 * trackWidth;
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = "#e8fbff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(guessX, trackY);
  ctx.lineTo(targetX, trackY);
  ctx.stroke();
  ctx.restore();
  for (const [x, color] of [[targetX, PIN_TARGET], [guessX, PIN_GUESS]]) {
    ctx.beginPath();
    ctx.arc(x, trackY, 20, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0e1511";
    ctx.stroke();
  }
  const delta = guessValue - targetValue;
  const percent = Math.round(Math.abs(delta) / 255 * 100);
  drawTag(ctx, delta === 0 ? "明度相同" : `${delta > 0 ? "偏亮 +" : "偏暗 −"}${percent}%`, (guessX + targetX) / 2, trackY - 28, 30);

  // Debrief card
  const s = layout.s;
  const cardX = 72;
  const cardW = 936;
  const cardY = layout.cardY;
  const cardH = 400 * s;
  roundRect(ctx, cardX, cardY, cardW, cardH, 18);
  const body = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
  body.addColorStop(0, "rgba(11,34,48,.92)");
  body.addColorStop(1, "rgba(10,20,28,.92)");
  ctx.fillStyle = body;
  ctx.shadowColor = "rgba(56,189,248,.5)";
  ctx.shadowBlur = 36;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(56,189,248,.65)";
  ctx.stroke();
  ctx.strokeStyle = BLUE_HOT;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cardX, cardY + 44 * s);
  ctx.lineTo(cardX, cardY);
  ctx.lineTo(cardX + 44 * s, cardY);
  ctx.moveTo(cardX + cardW, cardY + cardH - 44 * s);
  ctx.lineTo(cardX + cardW, cardY + cardH);
  ctx.lineTo(cardX + cardW - 44 * s, cardY + cardH);
  ctx.stroke();

  const inner = cardX + 36;
  text("戰術結算  DEBRIEF", inner, cardY + 62 * s, 28 * s, 700, "#9fc4d6");
  text("RGB 距離", inner, cardY + 128 * s, 28 * s, 500, "#9fc4d6");
  text(displayed.toFixed(1), inner - 4, cardY + 242 * s, 132 * s, 700, "#fff", { family: CARD_MONO });
  text("得分", cardX + cardW - 36, cardY + 128 * s, 28 * s, 500, "#9fc4d6", { align: "right" });
  ctx.save();
  ctx.font = `700 ${40 * s}px ${CARD_MONO}`;
  const suffixWidth = ctx.measureText(" / 1000").width;
  ctx.restore();
  text(" / 1000", cardX + cardW - 36, cardY + 238 * s, 40 * s, 500, "#8aa9b8", { align: "right", family: CARD_MONO });
  text(String(score), cardX + cardW - 36 - suffixWidth, cardY + 238 * s, 92 * s, 700, BLUE_HOT, { align: "right", family: CARD_MONO });

  const barY = cardY + 272 * s;
  const barW = cardW - 72;
  roundRect(ctx, inner, barY, barW, 26 * s, 13 * s);
  ctx.fillStyle = "#04101a";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(56,189,248,.5)";
  ctx.stroke();
  const fillW = Math.max(26 * s, barW * score / 1000);
  const fill = ctx.createLinearGradient(inner, 0, inner + barW, 0);
  fill.addColorStop(0, "#0369a1");
  fill.addColorStop(0.55, BLUE);
  fill.addColorStop(1, BLUE_HOT);
  ctx.save();
  roundRect(ctx, inner, barY, fillW, 26 * s, 13 * s);
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 22;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();

  // Ticker: the landmark's "flag" and coordinates.
  const tickerY = cardY + cardH - 60 * s;
  ctx.fillStyle = "rgba(56,189,248,.35)";
  for (let x = inner; x < inner + barW; x += 14) ctx.fillRect(x, tickerY - 16 * s, 7, 2);
  roundRect(ctx, inner, tickerY + 4 * s, 76 * s, 50 * s, 6);
  ctx.fillStyle = "#fff";
  ctx.fill();
  const flagH = 38 * s;
  ctx.drawImage(logo, inner + 38 * s - flagH * 193.6 / 261.6 / 2, tickerY + 10 * s, flagH * 193.6 / 261.6, flagH);
  const targetHsv = rgbToHsv(SITCON_GREEN);
  text(`SITCON 標準綠 ▸ ${hexColor(SITCON_GREEN)} ▸ RGB ${SITCON_GREEN.join("·")} ▸ H ${Math.round(targetHsv.hue)}° S ${Math.round(targetHsv.saturation * 100)}%`,
    inner + 96 * s, tickerY + 40 * s, 27 * s, 600, "#cfeaf6", { family: CARD_MONO, max: barW - 96 * s });

  // Grade stamp
  ctx.save();
  ctx.translate(cardX + cardW - 230, cardY);
  ctx.rotate(-6 * Math.PI / 180);
  ctx.font = `800 ${46 * s}px ${CARD_FONT}`;
  const stampW = Math.min(430, ctx.measureText(grade.name).width + 70);
  const stampH = 84 * s;
  roundRect(ctx, -stampW / 2, -stampH / 2, stampW, stampH, 10);
  ctx.fillStyle = "rgba(27,22,4,.92)";
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 34;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  roundRect(ctx, -stampW / 2 + 9, -stampH / 2 + 9, stampW - 18, stampH - 18, 5);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 16;
  ctx.fillText(grade.name, 0, 3, stampW - 40);
  ctx.restore();

  // Footer
  text(invitation, CARD_WIDTH / 2, layout.inviteY - (format === "story" ? 0 : 6), 46, 700, "#fff", { align: "center", max: 936 });
  text(mode, CARD_WIDTH / 2, layout.inviteY + 52, 30, 500, "#9fc4d6", { align: "center", max: 936 });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png");
  });
}

if (typeof module !== "undefined") module.exports = { fitZoom, fitFocus, wheelPoint };
