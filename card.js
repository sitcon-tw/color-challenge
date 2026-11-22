"use strict";

// Draws the shareable result cards on a canvas, in the same tactical style as the result screen.
const CARD_WIDTH = 1080;
const CARD_LAYOUT = {
  // Keep story text clear of app controls and the post readable in a centered square crop.
  story: {
    height: 1920, top: 278, titleY: 424, ruleY: 491,
    samplesY: 570, samplesH: 414,
    resultY: 1052, pointsY: 1228, modeY: 1346, inviteY: 1462,
  },
  post: {
    height: 1350, top: 153, titleY: 282, ruleY: 344,
    samplesY: 382, samplesH: 348,
    resultY: 760, pointsY: 939, modeY: 1049, inviteY: 1116,
  },
};
const CARD_FONT = '"Inter", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
const CARD_MONO = '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace';
const BLUE_HOT = "#8be3ff";
const GOLD = "#ffdf79";
const MAX_WHEEL_ZOOM = 5;

function wheelPoint({ hue, saturation }) {
  const angle = hue * Math.PI / 180;
  return { x: 50 + Math.sin(angle) * saturation * 50, y: 50 - Math.cos(angle) * saturation * 50 };
}

// The full wheel is 100 units across, so this distance is a percentage of its diameter.
function wheelGapPercent(guess, target) {
  const gap = Math.hypot(guess.x - target.x, guess.y - target.y);
  return gap <= 100 * Number.EPSILON ? 0 : gap;
}

// Same "zoom to fit" rule as the on-screen reveal. Screen = 50 + k * (world - midpoint).
function fitZoom(guess, target) {
  const gap = wheelGapPercent(guess, target);
  return gap < 45 ? Math.min(MAX_WHEEL_ZOOM, 45 / Math.max(gap, 1e-6)) : 1;
}

function radarZoomLabel(zoom) {
  if (zoom === 1) return "完整色盤";
  const rounded = Number(zoom.toFixed(1));
  return rounded === 1 ? "稍微放大" : `局部放大 ${rounded} 倍`;
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

function drawRadar(ctx, selection, cx, cy) {
  const guess = wheelPoint(selection);
  const target = wheelPoint(rgbToHsv(SITCON_GREEN));
  const mid = { x: (guess.x + target.x) / 2, y: (guess.y + target.y) / 2 };
  const zoom = fitZoom(guess, target);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.52, 0.52);
  const project = drawWheel(ctx, 0, 0, 272, zoom, fitFocus(mid, zoom));
  const from = project(guess);
  const to = project(target);
  const rim = ctx.createConicGradient(-Math.PI / 2, 0, 0);
  for (let hue = 0; hue <= 360; hue += 60) rim.addColorStop(hue / 360, `hsl(${hue} 72% 69%)`);
  ctx.beginPath();
  ctx.arc(0, 0, 138, 0, 2 * Math.PI);
  ctx.lineWidth = 7;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.strokeStyle = "#15231e";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([14, 9]);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f4fbff";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#15231e";
  ctx.beginPath();
  ctx.arc(from.x, from.y, 17, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#15231e";
  ctx.fillStyle = GOLD;
  ctx.fillRect(to.x - 9, to.y - 9, 18, 18);
  ctx.strokeRect(to.x - 9, to.y - 9, 18, 18);
  ctx.restore();
  return zoom;
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

function makeScoreImage({ rgb, grade, displayed, mode, invitation, selection, score, gameUrl }, format, logo) {
  const layout = CARD_LAYOUT[format];
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  const left = 96;
  const right = CARD_WIDTH - left;
  const panelWidth = right - left;
  const paper = "#f4f4ee";
  const muted = "#c0cfc7";

  function text(value, x, y, size, weight, color, align = "left", family = CARD_FONT) {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  drawBackground(ctx, layout.height);
  const { top, titleY, ruleY, samplesY, samplesH, resultY, pointsY, modeY, inviteY } = layout;
  ctx.fillStyle = BLUE_HOT;
  ctx.fillRect(left, top + 7, 6, 35);
  text("SITCON 學生計算機年會", left + 25, top + 39, 38, 650, muted);
  text("調出 SITCON 綠", left - 3, titleY, 88, 800, paper);
  text("看著標準色，憑眼力調出同一種綠。", left, ruleY, 42, 500, muted);
  const radarX = right - 100;
  const radarZoom = drawRadar(ctx, selection, radarX, top + 86);
  text(radarZoomLabel(radarZoom), radarX, top + 203, 28, 650, muted, "center");

  // Both marks get the same neutral surround and subtle outline, even for a white guess.
  ctx.fillStyle = "#e8e8e5";
  ctx.beginPath();
  ctx.roundRect(left, samplesY, panelWidth, samplesH, 22);
  ctx.fill();
  ctx.fillStyle = "#bfc4be";
  ctx.fillRect(CARD_WIDTH / 2 - 1, samplesY + 32, 2, samplesH - 64);

  const markH = samplesH - 96;
  const markW = markH * logo.naturalWidth / logo.naturalHeight;
  const guessMark = document.createElement("canvas");
  guessMark.width = Math.ceil(markW);
  guessMark.height = markH;
  const ink = guessMark.getContext("2d");
  ink.drawImage(logo, 0, 0, guessMark.width, markH);
  ink.globalCompositeOperation = "source-in";
  ink.fillStyle = hexColor(rgb);
  ink.fillRect(0, 0, guessMark.width, markH);
  for (const [position, mark, label] of [[0.25, guessMark, "我調的顏色"], [0.75, logo, "SITCON 標準綠"]]) {
    const cx = left + panelWidth * position;
    ctx.save();
    ctx.shadowColor = "rgba(28,38,32,.38)";
    ctx.shadowBlur = 4;
    ctx.drawImage(mark, cx - markW / 2, samplesY + 14, markW, markH);
    ctx.restore();
    text(label, cx, samplesY + samplesH - 36, 42, 700, "#22322c", "center");
  }

  text(grade.verdict, left, resultY + 67, 73, 800, paper);
  ctx.save();
  ctx.font = `700 46px ${CARD_FONT}`;
  const stampW = ctx.measureText(grade.name).width + 68;
  ctx.translate(right - stampW / 2 - 3, resultY + 38);
  ctx.rotate(-0.038);
  ctx.strokeStyle = GOLD;
  ctx.fillStyle = "#332c1d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-stampW / 2, -42, stampW, 84, 10);
  ctx.fill();
  ctx.stroke();
  ctx.textBaseline = "middle";
  text(grade.name, 0, 0, 46, 700, GOLD, "center");
  ctx.restore();

  const points = String(score);
  text(points, left - 3, pointsY, 91, 700, BLUE_HOT, "left", CARD_MONO);
  const pointsW = ctx.measureText(points).width;
  text("/ 1000 分", left + pointsW + 12, pointsY - 8, 41, 600, paper);
  text("RGB 距離 " + displayed.toFixed(1), right, pointsY - 37, 44, 700, paper, "right");
  text("0 就是同色", right, pointsY + 17, 36, 500, muted, "right");

  ctx.fillStyle = "#3b5150";
  ctx.fillRect(left, pointsY + 50, panelWidth, 8);
  ctx.fillStyle = BLUE_HOT;
  ctx.fillRect(left, pointsY + 50, panelWidth * score / 1000, 8);
  text(mode, left, modeY, 39, 550, muted);

  text(invitation, left, inviteY, 49, 700, paper);
  const url = new URL(gameUrl);
  text(url.host + url.pathname, left, inviteY + 69, 42, 650, BLUE_HOT, "left", CARD_MONO);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png");
  });
}

if (typeof module !== "undefined") module.exports = { fitZoom, fitFocus, wheelPoint, wheelGapPercent, radarZoomLabel };
