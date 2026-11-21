"use strict";

const byId = id => document.getElementById(id);
const wheel = byId("wheel");
const cursor = byId("cursor");
const brightness = byId("brightness");
const roundDuration = 30_000;
let selection = randomStartingColor();
let deadline = null;
let clock;

function renderSelection() {
  const { hue, saturation, value } = selection;
  const angle = hue * Math.PI / 180;
  cursor.style.left = (50 + Math.sin(angle) * saturation * 50) + "%";
  cursor.style.top = (50 - Math.cos(angle) * saturation * 50) + "%";
  wheel.style.setProperty("--shade", 1 - value / 255);

  brightness.value = value;
  brightness.setAttribute("aria-valuetext", Math.round(value / 255 * 100) + "%");
  brightness.style.setProperty("--bright-end", hexColor(hsvToRgb({ ...selection, value: 255 })));
  byId("guess-ink").setAttribute("fill", hexColor(hsvToRgb(selection)));
}

function pickFromWheel(event) {
  if (!canAdjust()) return;
  const bounds = wheel.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
  const y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  selection.saturation = Math.min(1, Math.hypot(x, y));
  if (selection.saturation > 0) {
    selection.hue = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
  }
  renderSelection();
}

wheel.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0) return;
  wheel.focus({ preventScroll: true });
  wheel.setPointerCapture(event.pointerId);
  pickFromWheel(event);
});
wheel.addEventListener("pointermove", event => {
  if (wheel.hasPointerCapture(event.pointerId)) pickFromWheel(event);
});
wheel.addEventListener("keydown", event => {
  if (!canAdjust()) return;
  const step = event.shiftKey ? 0.1 : 1;
  switch (event.key) {
    case "ArrowLeft": selection.hue = (selection.hue + 360 - step) % 360; break;
    case "ArrowRight": selection.hue = (selection.hue + step) % 360; break;
    case "ArrowUp": selection.saturation = Math.min(1, selection.saturation + step / 100); break;
    case "ArrowDown": selection.saturation = Math.max(0, selection.saturation - step / 100); break;
    default: return;
  }
  event.preventDefault();
  renderSelection();
});
brightness.addEventListener("input", () => {
  if (!canAdjust()) return;
  selection.value = brightness.valueAsNumber;
  renderSelection();
});

function switchScreen(showResult) {
  byId("play").hidden = showResult;
  byId("result").hidden = !showResult;
  byId(showResult ? "result-title" : "play-title").focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function showSwatch(prefix, rgb) {
  const hex = hexColor(rgb);
  byId(prefix + "-ink").style.backgroundColor = hex;
  byId(prefix + "-hex").textContent = hex;
  byId(prefix + "-rgb").textContent = rgb.join(", ");
}

function canAdjust() {
  if (byId("play").hidden) return false;
  if (deadline !== null && Date.now() >= deadline) {
    finishRound();
    return false;
  }
  return true;
}

function updateClock() {
  if (deadline === null || !canAdjust()) return;
  const seconds = Math.ceil(Math.min(roundDuration, Math.max(0, deadline - Date.now())) / 1000);
  byId("countdown").textContent = seconds + " 秒";
  byId("countdown").classList.toggle("last-seconds", seconds <= 5);
}

function beginRound(timed) {
  clearInterval(clock);
  selection = randomStartingColor();
  renderSelection();
  if (byId("play").hidden) switchScreen(false);
  deadline = timed ? Date.now() + roundDuration : null;
  byId("countdown").hidden = !timed;
  byId("toggle-time").textContent = timed ? "改玩不限時" : "開始 30 秒挑戰";
  if (timed) {
    updateClock();
    clock = setInterval(updateClock, 200);
  }
}

function finishRound() {
  if (byId("play").hidden) return;
  clearInterval(clock);
  const remaining = deadline === null ? null : Math.min(roundDuration, Math.max(0, deadline - Date.now()));
  const mode = remaining === null ? "不限時" : "30 秒挑戰";
  let modeSummary = mode;
  if (remaining !== null) {
    const elapsed = Math.floor((roundDuration - remaining) / 100) / 10;
    if (remaining === 0) modeSummary += " · 時間到";
    else modeSummary += elapsed === 0 ? " · 用時不到 0.1 秒" : ` · 用時 ${elapsed} 秒`;
  }
  const rgb = hsvToRgb(selection);
  const { differences, distance } = compareWithSitcon(rgb);
  const { displayed, grade } = describeScore(distance);
  const rank = rankAmongRgbColors(differences);
  showSwatch("result", rgb);
  showSwatch("official", SITCON_GREEN);
  byId("result-title").textContent = distance === 0 ? "完全命中 SITCON 綠！" : "你的挑戰結果";
  byId("result-mode").textContent = modeSummary;
  byId("grade-line").textContent = grade.line;
  byId("grade").textContent = grade.name;
  byId("distance").textContent = displayed;
  byId("color-rank").textContent = randomGuessComparison(rank);
  byId("rank-detail").textContent = `把全部 ${RGB_COLORS.toLocaleString("zh-TW")} 種 RGB 顏色按原始距離排序，你的選色是第 ${rank.toLocaleString("zh-TW")} 名，同距離並列。`;
  byId("score-guide").open = false;
  ["red-diff", "green-diff", "blue-diff"].forEach((id, index) => {
    const delta = differences[index];
    byId(id).textContent = delta > 0 ? "+" + delta : String(delta);
  });
  byId("replay").textContent = deadline === null ? "再玩一次" : "再挑戰 30 秒";
  prepareShare({ rgb, grade, displayed, differences, mode: modeSummary });
  if (byId("help").open) byId("help").close();
  switchScreen(true);
}

byId("guess-form").addEventListener("submit", event => {
  event.preventDefault();
  finishRound();
});
byId("toggle-time").addEventListener("click", () => {
  if (canAdjust()) beginRound(deadline === null);
});
byId("replay").addEventListener("click", () => beginRound(deadline !== null));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateClock();
});
byId("help-button").addEventListener("click", () => byId("help").showModal());
GRADES.forEach(({ max, name }, index) => {
  const row = document.createElement("div");
  const range = document.createElement("dt");
  const label = document.createElement("dd");
  const previous = GRADES[index - 1]?.max;
  range.textContent = max === 0 ? "0" : max === Infinity ? `大於 ${previous}` : `${previous} < 距離 ≤ ${max}`;
  label.textContent = name;
  row.append(range, label);
  byId("grade-scale").append(row);
});
renderSelection();
