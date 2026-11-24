"use strict";

const byId = id => document.getElementById(id);
const wheel = byId("wheel");
const cursor = byId("cursor");
const brightness = byId("brightness");
const modes = byId("modes");
const dial = byId("dial");
const instrument = dial.closest(".instrument");
const spinButton = byId("spin-wheel");
const shareButton = byId("share-result");
const replayButton = byId("replay");
const playedModes = new Set();
const supportsTilt = Boolean(window.DeviceOrientationEvent && window.DOMMatrix);
let round;
let clock = null;
let gesture = null;
let spinAnimation = null;
let tiltController = null;

function renderSelection() {
  const { value } = round.aim;
  const point = wheelPoint(round.aim, round.rotation);
  cursor.style.left = point.x + "%";
  cursor.style.top = point.y + "%";
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
  if (round.mode !== "gyro") brightness.disabled = round.locked.has("brightness");
  spinButton.hidden = !playedModes.size || round.spinDegrees > 0 || round.startedAt !== null;
  const hint = byId("wheel-hint");
  hint.hidden = !spinButton.hidden;
  if (round.mode === "gyro") hint.textContent = "傾斜手機移動游標";
  else if (round.mode === "oneshot") hint.textContent = wheelLocked ? "色盤已鎖定" : "按下即鎖定";
  else hint.textContent = round.spinDegrees ? "已轉向，拖圓點微調" : "點選色盤，拖圓點微調";
  byId("brightness-hint").textContent = round.locked.has("brightness") ? "明度已鎖定" : "由暗到亮";
}

function pick(control, values, lock = false) {
  if (byId("play").hidden || spinAnimation) return;
  if (round.mode === "gyro" && byId("submit-guess").disabled) return;
  const now = Date.now();
  if (round.expired(now)) return finishRound(now);
  const firstPick = round.startedAt === null;
  if (!round.pick(control, values, lock, now)) return;
  renderSelection();
  if (round.locked.size === 2) return finishRound(now);
  if (firstPick || round.locked.has(control)) renderLocks();
  if (clock === null) clock = setInterval(updateClock, 200);
}

function pickFromWheel(clientX, clientY, lock) {
  const bounds = wheel.getBoundingClientRect();
  const x = (clientX - bounds.left) / bounds.width * 2 - 1;
  const y = (clientY - bounds.top) / bounds.height * 2 - 1;
  pick("wheel", colorAtWheelPoint(x, y, round.aim.hue, round.rotation), lock);
}

function brightnessTrack() {
  const bounds = brightness.getBoundingClientRect();
  // The input is two thumbs tall. Its value spans the travel of the thumb's center.
  const radius = bounds.height / 4;
  return { start: bounds.left + radius, length: bounds.width - 2 * radius, radius };
}

function pickBrightnessAt(clientX, _clientY, lock) {
  const { start, length } = brightnessTrack();
  const position = (clientX - start) / length;
  pick("brightness", { value: Math.round(255 * Math.max(0, Math.min(1, position))) }, lock);
}

function bindPicker(surface, control, pickAt) {
  surface.addEventListener("pointerdown", event => {
    if (!event.isPrimary) {
      gesture = null;
      return;
    }
    if (event.button !== 0 || spinAnimation || control.disabled || control.tabIndex < 0) return;
    // Fine pointers use the native range. Touch hits its scrollable wrapper.
    if (event.target === brightness && round.mode !== "oneshot") return;
    if (round.mode === "oneshot") {
      event.preventDefault();
      control.focus({ preventScroll: true });
      pickAt(event.clientX, event.clientY, true);
      return;
    }
    let action = "drag";
    let offsetX = 0;
    let offsetY = 0;
    if (event.pointerType === "touch") {
      if (control === brightness) {
        action = "horizontal";
        const { start, length, radius } = brightnessTrack();
        const thumbX = start + length * brightness.valueAsNumber / 255;
        if (Math.abs(thumbX - event.clientX) <= radius) offsetX = thumbX - event.clientX;
      } else if (event.target === cursor) {
        action = "grab";
        const dot = cursor.getBoundingClientRect();
        offsetX = dot.left + dot.width / 2 - event.clientX;
        offsetY = dot.top + dot.height / 2 - event.clientY;
      } else action = "tap";
    }
    gesture = { id: event.pointerId, control, action, x: event.clientX, y: event.clientY, offsetX, offsetY };
    surface.setPointerCapture(event.pointerId);
    if (action === "drag") {
      control.focus({ preventScroll: true });
      pickAt(event.clientX, event.clientY, false);
    }
  });

  function update(event) {
    if (gesture?.id !== event.pointerId || gesture.control !== control) return;
    const { action, x, y, offsetX, offsetY } = gesture;
    gesture.action = nextPickAction(action, event.clientX - x, event.clientY - y, event.type === "pointerup");
    if (gesture.action === "pick") pickAt(x + offsetX, y + offsetY, false);
    else if (gesture.action === "drag") pickAt(event.clientX + offsetX, event.clientY + offsetY, false);
  }
  function cancel(event) {
    if (gesture?.id === event.pointerId && gesture.control === control) gesture = null;
  }
  surface.addEventListener("pointermove", update);
  surface.addEventListener("pointerup", event => {
    update(event);
    cancel(event);
  });
  surface.addEventListener("pointercancel", cancel);
  surface.addEventListener("lostpointercapture", cancel);
}
bindPicker(wheel, wheel, pickFromWheel);
bindPicker(brightness.parentElement, brightness, pickBrightnessAt);

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

function switchScreen(showResult) {
  byId("play").hidden = showResult;
  byId("result").hidden = !showResult;
  byId(showResult ? "result-title" : "play-title").focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function orderResultPair(first, second) {
  if (first.nextElementSibling === second) return;
  // Move the unfocused sibling so resizing preserves keyboard focus.
  if (first.contains(document.activeElement)) first.after(second);
  else second.before(first);
}

function placeResultLinks({ matches: narrow }) {
  const links = document.querySelector(".result-links");
  const details = document.querySelector(".score-panel");
  if (narrow) orderResultPair(links, details);
  else orderResultPair(details, links);
}

const narrowResults = window.matchMedia("(max-width: 47rem)");
placeResultLinks(narrowResults);
narrowResults.addEventListener("change", placeResultLinks);

new ResizeObserver(() => {
  // The mobile grid can still stack when the player uses larger text.
  const sideBySide = shareButton.offsetLeft !== replayButton.offsetLeft;
  if (narrowResults.matches && sideBySide) orderResultPair(replayButton, shareButton);
  else orderResultPair(shareButton, replayButton);
}).observe(shareButton.parentElement);

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
  followTilt(tiltController.signal, () => byId("help").open || spinAnimation ? null : round,
    values => pick("wheel", values), setTiltStatus);
});

function modeHint(choice) {
  if (playedModes.size && choice.value === "normal") {
    if (!playedModes.has("oneshot")) return "試試一發入魂，色盤和明度各只能按一次。";
    if (!playedModes.has("timed")) return "試試 30 秒挑戰，看你能多快調出 SITCON 綠。";
    if (!playedModes.has("gyro") && window.isSecureContext && supportsTilt && navigator.maxTouchPoints) {
      return "也可以選陀螺儀，傾斜手機來調色。";
    }
  }
  return choice.dataset.hint;
}

function beginRound() {
  stopReveal();
  tiltController?.abort();
  clearInterval(clock);
  clock = null;
  gesture = null;
  spinAnimation?.cancel();
  spinAnimation = null;
  instrument.inert = false;
  const choice = modes.selectedOptions[0];
  round = new Round(choice.value, randomStartingColor(), round?.rotation);
  byId("mode-hint").textContent = modeHint(choice);
  byId("guess-form").dataset.mode = round.mode;
  byId("guess-form").toggleAttribute("data-replay", playedModes.size > 0);
  dial.style.setProperty("--wheel-angle", round.rotation + "deg");
  byId("submit-guess").hidden = round.mode === "oneshot";
  byId("submit-guess").disabled = false;
  byId("tilt-button").hidden = round.mode !== "gyro";
  byId("clock-label").textContent = round.mode === "timed" ? "剩餘" : "用時";
  renderLocks();
  if (round.mode === "gyro") {
    setTiltStatus(!window.isSecureContext ? "insecure" : supportsTilt ? "idle" : "unsupported");
  }
  renderSelection();
  if (byId("play").hidden) switchScreen(false);
  updateClock();
}

spinButton.addEventListener("click", async () => {
  if (!playedModes.size || gesture || spinAnimation) return;
  const degrees = round.spin();
  if (!degrees) return;
  const spinningRound = round;
  const hadFocus = spinButton === document.activeElement;
  dial.style.setProperty("--wheel-angle", round.rotation + "deg");
  renderSelection();
  renderLocks();
  if (!motionPreference.matches && !effectsPaused) {
    spinAnimation = dial.animate([{ transform: "rotate(" + -degrees + "deg)" }, { transform: "none" }],
      { duration: 520, easing: "cubic-bezier(.2,.65,.25,1)" });
    instrument.inert = true;
    try { await spinAnimation.finished; } catch { /* Changing modes cancels the turn. */ }
    if (round !== spinningRound) return;
    spinAnimation = null;
    instrument.inert = false;
  }
  if (hadFocus && (document.activeElement === document.body || document.activeElement === spinButton)) {
    const tiltButton = byId("tilt-button");
    const nextControl = round.mode === "gyro" ? (tiltButton.disabled ? modes : tiltButton) : wheel;
    nextControl.focus({ preventScroll: true });
  }
});
motionPreference.addEventListener("change", () => { if (motionPreference.matches) spinAnimation?.finish(); });

function finishRound(now = Date.now()) {
  if (byId("play").hidden) return;
  tiltController?.abort();
  clearInterval(clock);
  playedModes.add(round.mode);
  gesture = null;
  const modeLabel = modes.selectedOptions[0].textContent.trim();
  const modeSummary = modeLabel + " · " + round.resultTime(now);
  const spinLabel = round.spinDegrees ? `色盤轉了 ${round.spinDegrees}°` : "";
  const rgb = hsvToRgb(round.selection);
  const { differences, distance } = compareWithSitcon(rgb);
  const { displayed, grade } = describeScore(distance);
  const score = scoreFromDistance(distance);
  const rank = rankAmongRgbColors(differences);
  showSwatch("result", rgb);
  showSwatch("official", SITCON_GREEN);
  byId("result-title").textContent = grade.verdict + "！";
  byId("result-mode").textContent = modeSummary;
  const spinMark = byId("result-spin");
  spinMark.textContent = spinLabel;
  spinMark.hidden = !spinLabel;
  byId("grade-line").textContent = grade.line;
  byId("grade").textContent = grade.name;
  byId("distance").textContent = displayed.toFixed(1);
  byId("final-score").textContent = score;
  byId("color-rank").textContent = randomGuessComparison(rank);
  byId("rank-detail").textContent = `把全部 ${RGB_COLORS.toLocaleString("zh-TW")} 種 RGB 顏色按原始距離排序，你的選色是第 ${rank.toLocaleString("zh-TW")} 名，同距離並列。`;
  byId("score-guide").open = false;
  ["red-diff", "green-diff", "blue-diff"].forEach((id, index) => {
    const delta = differences[index];
    byId(id).textContent = delta > 0 ? "+" + delta : String(delta);
  });
  replayButton.textContent = round.mode === "timed" ? "再挑戰 30 秒" : "再玩一次";
  prepareShare({ rgb, grade, displayed, differences, mode: modeSummary, kind: round.mode, selection: { ...round.selection }, rotation: round.rotation, spinLabel, score });
  if (byId("help").open) byId("help").close();
  playReveal({ selection: round.selection, rotation: round.rotation, score, compact: narrowResults.matches });
  switchScreen(true);
}

byId("guess-form").addEventListener("submit", event => {
  event.preventDefault();
  if (round.mode !== "oneshot" && !spinAnimation && !byId("submit-guess").disabled) finishRound();
});
modes.addEventListener("change", beginRound);
replayButton.addEventListener("click", beginRound);
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
