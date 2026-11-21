"use strict";

const byId = id => document.getElementById(id);
const wheel = byId("wheel");
const cursor = byId("cursor");
const brightness = byId("brightness");
const modes = byId("modes");
let round;
let clock = null;
let dragPointer = null;
let tiltController = null;

function renderSelection() {
  const { hue, saturation, value } = round.aim;
  const angle = hue * Math.PI / 180;
  cursor.style.left = (50 + Math.sin(angle) * saturation * 50) + "%";
  cursor.style.top = (50 - Math.cos(angle) * saturation * 50) + "%";
  wheel.style.setProperty("--shade", 1 - round.selection.value / 255);

  brightness.value = value;
  brightness.setAttribute("aria-valuetext", Math.round(value / 255 * 100) + "%");
  brightness.style.setProperty("--bright-end", hexColor(hsvToRgb({ ...round.selection, value: 255 })));
  byId("guess-ink").setAttribute("fill", hexColor(hsvToRgb(round.selection)));
}

function renderLocks() {
  const wheelLocked = round.locked.has("wheel");
  const manualWheel = !wheelLocked && round.mode !== "gyro";
  wheel.setAttribute("aria-disabled", String(!manualWheel));
  wheel.tabIndex = manualWheel ? 0 : -1;
  brightness.disabled = round.locked.has("brightness");
  byId("wheel-hint").textContent = round.mode === "gyro" ? "傾斜手機移動游標" : wheelLocked ? "色盤已鎖定" : "越靠外圈越飽和";
  byId("brightness-hint").textContent = brightness.disabled ? "明度已鎖定" : "由暗到亮";
}

function pick(control, values, lock = false) {
  if (byId("play").hidden) return;
  if (round.mode === "gyro" && byId("submit-guess").disabled) return;
  const now = Date.now();
  if (round.expired(now)) return finishRound(now);
  if (!round.pick(control, values, lock, now)) return;
  renderSelection();
  if (round.locked.size === 2) return finishRound(now);
  if (round.locked.has(control)) renderLocks();
  if (clock === null) clock = setInterval(updateClock, 200);
}

function pickFromWheel(event, lock) {
  const bounds = wheel.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
  const y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  pick("wheel", colorAtWheelPoint(x, y, round.aim.hue), lock);
}

wheel.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0 || wheel.tabIndex < 0) return;
  wheel.focus({ preventScroll: true });
  if (round.mode !== "oneshot") {
    dragPointer = event.pointerId;
    wheel.setPointerCapture(dragPointer);
  }
  pickFromWheel(event, true);
});
wheel.addEventListener("pointermove", event => {
  if (dragPointer === event.pointerId && wheel.hasPointerCapture(dragPointer)) pickFromWheel(event, false);
});

function lockFromKeyboard(event, control, values) {
  if (round.mode !== "oneshot" || (event.key !== "Enter" && event.key !== " ")) return false;
  event.preventDefault();
  if (!event.repeat && !round.locked.has(control)) {
    pick(control, values, true);
    if (!byId("play").hidden) (control === "wheel" ? brightness : wheel).focus();
  }
  return true;
}

wheel.addEventListener("keydown", event => {
  if (wheel.tabIndex < 0) return;
  let { hue, saturation } = round.aim;
  if (lockFromKeyboard(event, "wheel", { hue, saturation })) return;
  const step = event.shiftKey ? 0.1 : 1;
  switch (event.key) {
    case "ArrowLeft": hue = (hue + 360 - step) % 360; break;
    case "ArrowRight": hue = (hue + step) % 360; break;
    case "ArrowUp": saturation = Math.min(1, saturation + step / 100); break;
    case "ArrowDown": saturation = Math.max(0, saturation - step / 100); break;
    default: return;
  }
  event.preventDefault();
  pick("wheel", { hue, saturation });
});
brightness.addEventListener("input", () => pick("brightness", { value: brightness.valueAsNumber }));
brightness.addEventListener("keydown", event => lockFromKeyboard(event, "brightness", { value: brightness.valueAsNumber }));
brightness.addEventListener("pointerdown", event => {
  if (round.mode !== "oneshot" || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  // The range is two thumbs tall. Its center-to-center travel excludes one thumb.
  const bounds = brightness.getBoundingClientRect();
  const thumb = bounds.height / 2;
  const position = (event.clientX - bounds.left - thumb / 2) / (bounds.width - thumb);
  pick("brightness", { value: Math.round(255 * Math.max(0, Math.min(1, position))) }, true);
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

const tiltMessages = {
  idle: ["啟用感應", ""],
  permission: [null, "請在瀏覽器的提示中允許動作感應。"],
  waiting: [null, "正在校正，請先用舒服的姿勢拿穩手機。"],
  active: ["重新校正", "朝想選的顏色傾斜手機移動游標，明度用滑桿調整。"],
  missing: ["重試感應", "還沒收到感應資料。請輕輕傾斜手機，或切換一般模式。"],
  denied: ["重試感應", "請在瀏覽器允許動作感應後重試，或切換一般模式。"],
  unsupported: [null, "這個瀏覽器無法讀取動作感應，可以切換一般模式選色。"],
  insecure: [null, "請用 HTTPS 網址開啟動作感應，或切換一般模式。"],
};

function setTiltStatus(state) {
  const [action, hint] = tiltMessages[state];
  const button = byId("tilt-button");
  button.textContent = action ?? "啟用感應";
  button.disabled = !action;
  if (hint) byId("mode-hint").textContent = hint;
  brightness.disabled = byId("submit-guess").disabled = state !== "active";
}

byId("tilt-button").addEventListener("click", () => {
  tiltController?.abort();
  tiltController = new AbortController();
  followTilt(tiltController.signal, () => byId("help").open ? null : round.selection,
    values => pick("wheel", values), setTiltStatus);
});

function beginRound() {
  tiltController?.abort();
  clearInterval(clock);
  clock = null;
  dragPointer = null;
  const choice = modes.querySelector(":checked");
  round = new Round(choice.value, randomStartingColor());
  byId("mode-hint").textContent = choice.dataset.hint;
  byId("guess-form").dataset.mode = round.mode;
  byId("submit-guess").hidden = round.mode === "oneshot";
  byId("submit-guess").disabled = false;
  byId("tilt-button").hidden = round.mode !== "gyro";
  byId("clock-label").textContent = round.mode === "timed" ? "剩餘" : "用時";
  renderLocks();
  if (round.mode === "gyro") {
    const supported = window.DeviceOrientationEvent && window.DOMMatrix;
    setTiltStatus(!window.isSecureContext ? "insecure" : supported ? "idle" : "unsupported");
  }
  renderSelection();
  if (byId("play").hidden) switchScreen(false);
  updateClock();
}

function finishRound(now = Date.now()) {
  if (byId("play").hidden) return;
  tiltController?.abort();
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
  prepareShare({ rgb, grade, displayed, differences, mode: modeSummary, kind: round.mode });
  if (byId("help").open) byId("help").close();
  switchScreen(true);
}

byId("guess-form").addEventListener("submit", event => {
  event.preventDefault();
  if (round.mode !== "oneshot" && !byId("submit-guess").disabled) finishRound();
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
