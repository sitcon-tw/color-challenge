"use strict";

const byId = id => document.getElementById(id);
const wheel = byId("wheel");
const cursor = byId("cursor");
const brightness = byId("brightness");
const modes = byId("modes");
let round;
let clock = null;
let dragPointer = null;

function renderSelection() {
  const { hue, saturation, value } = round.selection;
  const angle = hue * Math.PI / 180;
  cursor.style.left = (50 + Math.sin(angle) * saturation * 50) + "%";
  cursor.style.top = (50 - Math.cos(angle) * saturation * 50) + "%";
  wheel.style.setProperty("--shade", 1 - value / 255);

  brightness.value = value;
  brightness.setAttribute("aria-valuetext", Math.round(value / 255 * 100) + "%");
  brightness.style.setProperty("--bright-end", hexColor(hsvToRgb({ ...round.selection, value: 255 })));
  byId("guess-ink").setAttribute("fill", hexColor(hsvToRgb(round.selection)));
}

function pick(values) {
  if (byId("play").hidden) return;
  const now = Date.now();
  if (round.expired(now)) return finishRound(now);
  if (!round.pick(values, now)) return;
  renderSelection();
  if (clock === null) clock = setInterval(updateClock, 200);
}

function pickFromWheel(event) {
  const bounds = wheel.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
  const y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  pick(colorAtWheelPoint(x, y, round.selection.hue));
}

wheel.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0) return;
  wheel.focus({ preventScroll: true });
  dragPointer = event.pointerId;
  wheel.setPointerCapture(dragPointer);
  pickFromWheel(event);
});
wheel.addEventListener("pointermove", event => {
  if (dragPointer === event.pointerId && wheel.hasPointerCapture(dragPointer)) pickFromWheel(event);
});

wheel.addEventListener("keydown", event => {
  let { hue, saturation } = round.selection;
  const step = event.shiftKey ? 0.1 : 1;
  switch (event.key) {
    case "ArrowLeft": hue = (hue + 360 - step) % 360; break;
    case "ArrowRight": hue = (hue + step) % 360; break;
    case "ArrowUp": saturation = Math.min(1, saturation + step / 100); break;
    case "ArrowDown": saturation = Math.max(0, saturation - step / 100); break;
    default: return;
  }
  event.preventDefault();
  pick({ hue, saturation });
});
brightness.addEventListener("input", () => pick({ value: brightness.valueAsNumber }));

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

function updateClock() {
  if (byId("play").hidden) return;
  const now = Date.now();
  if (round.expired(now)) return finishRound(now);
  const elapsed = round.elapsed(now);
  const timed = round.mode === "timed";
  const seconds = timed ? Math.ceil((ROUND_DURATION - elapsed) / 1000) : Math.floor(elapsed / 1000);
  const display = timed ? seconds + " 秒" : Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  const value = byId("clock-value");
  if (value.textContent !== display) value.textContent = display;
  value.classList.toggle("last-seconds", timed && seconds <= 5);
}

function beginRound() {
  clearInterval(clock);
  clock = null;
  dragPointer = null;
  const choice = modes.querySelector(":checked");
  round = new Round(choice.value, randomStartingColor());
  byId("mode-hint").textContent = choice.dataset.hint;
  byId("guess-form").dataset.mode = round.mode;
  byId("clock-label").textContent = round.mode === "timed" ? "剩餘" : "用時";
  renderSelection();
  if (byId("play").hidden) switchScreen(false);
  updateClock();
}

function finishRound(now = Date.now()) {
  if (byId("play").hidden) return;
  clearInterval(clock);
  const modeLabel = modes.querySelector(":checked").labels[0].textContent.trim();
  const modeSummary = modeLabel + " · " + round.resultTime(now);
  const rgb = hsvToRgb(round.selection);
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
  byId("replay").textContent = round.mode === "timed" ? "再挑戰 30 秒" : "再玩一次";
  prepareShare({ rgb, grade, displayed, differences, mode: modeSummary });
  if (byId("help").open) byId("help").close();
  switchScreen(true);
}

byId("guess-form").addEventListener("submit", event => {
  event.preventDefault();
  finishRound();
});
modes.addEventListener("change", beginRound);
byId("replay").addEventListener("click", beginRound);
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
beginRound();
