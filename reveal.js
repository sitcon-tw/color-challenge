"use strict";

// Reveal timing is in milliseconds from the moment the result opens.
const q = id => document.getElementById(id);
const TIMELINE = { land: 450, pull: 800, fly: 1950, flyLength: 700, hit: 2650, gauge: 2850, gaugeLength: 500, card: 3550, bar: 3800, barLength: 1000, stamp: 4850, ticker: 5200 };

const revealRoot = q("result");
const mapWorld = q("map-world");
const skipButton = q("skip-reveal");
const targetHsv = rgbToHsv(SITCON_GREEN);

let current = null;

function wheelPosition({ hue, saturation }) {
  const angle = hue * Math.PI / 180;
  return { x: 50 + Math.sin(angle) * saturation * 50, y: 50 - Math.cos(angle) * saturation * 50 };
}

// ---- Visual helpers -----------------------------------------------------
const easeOut = t => 1 - (1 - t) ** 3;
const easeOutQuint = t => 1 - (1 - t) ** 5;
const pct = value => value.toFixed(2) + "%";

function restart(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function setLine(from, to) {
  for (const id of ["laser", "laser-glow"]) {
    const line = q(id);
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
  }
  q("spark").setAttribute("cx", to.x);
  q("spark").setAttribute("cy", to.y);
}

function setTicker(rgb) {
  const track = q("ticker-track");
  const { hue, saturation } = targetHsv;
  const parts = [
    ["SITCON 標準綠"],
    ["座標 ", `H ${Math.round(hue)}° · S ${Math.round(saturation * 100)}%`],
    [hexColor(rgb)],
    ["RGB ", rgb.join(" · ")],
  ];
  track.replaceChildren(...[0, 1].map(() => {
    const group = document.createElement("span");
    parts.forEach(([head, tail], index) => {
      const part = document.createElement(index === 0 || tail === undefined ? "b" : "i");
      part.style.fontStyle = "normal";
      part.textContent = tail === undefined ? head : head + tail;
      group.append(part, index < parts.length - 1 ? " ▸ " : "");
    });
    return group;
  }));
  track.lastElementChild.setAttribute("aria-hidden", "true");
}

function gaugeText(delta) {
  return delta === 0 ? "明度相同" : (delta > 0 ? "偏亮 +" : "偏暗 −") + Math.round(Math.abs(delta) / 255 * 100) + "%";
}

function setGauge(from, to) {
  const head = Math.min(from, to) / 255 * 100;
  q("vg-beam").style.setProperty("--bl", pct(head));
  q("vg-beam").style.setProperty("--bw", pct(Math.abs(to - from) / 255 * 100));
  q("vg-tag").style.setProperty("--tl", pct((from + to) / 2 / 255 * 100));
}

function showFinal({ displayed, score, guess, target, valueGuess, valueTarget }) {
  q("spark").style.opacity = "0";
  setGauge(valueGuess, valueTarget);
  q("vg-tag").textContent = gaugeText(valueGuess - valueTarget);
  q("vgauge").classList.add("on");
  const mid = { x: (guess.x + target.x) / 2, y: (guess.y + target.y) / 2 };
  delete revealRoot.dataset.reveal;
  setLine(guess, target);
  mapWorld.style.setProperty("--mx", pct(mid.x));
  mapWorld.style.setProperty("--my", pct(mid.y));
  q("range-tag").textContent = displayed.toFixed(1);
  q("distance").textContent = displayed.toFixed(1);
  q("score-points").textContent = score;
  q("tac-fill").style.width = score / 10 + "%";
  q("ticker-track").parentElement.classList.add("on");
  q("tac-card").classList.add("on");
  skipButton.hidden = true;
}

// ---- Public entry points ------------------------------------------------
function stopReveal() {
  current?.cancel();
  current = null;
}

function playReveal({ selection, displayed, score }) {
  stopReveal();
  const guess = wheelPosition(selection);
  const target = wheelPosition(targetHsv);
  const mid = { x: (guess.x + target.x) / 2, y: (guess.y + target.y) / 2 };
  // Close pins get a "zoom to fit" so the distance tag has room.
  const gap = Math.hypot(guess.x - target.x, guess.y - target.y);
  const zoom = fitZoom(guess, target);
  const focus = fitFocus(mid, zoom);
  mapWorld.style.setProperty("--zoom", zoom);
  mapWorld.style.setProperty("--zx", zoom === 1 ? "0%" : pct(50 - guess.x - zoom * (focus.x - guess.x)));
  mapWorld.style.setProperty("--zy", zoom === 1 ? "0%" : pct(50 - guess.y - zoom * (focus.y - guess.y)));
  const valueGuess = selection.value;
  const valueTarget = targetHsv.value;
  const data = { displayed, score, guess, target, valueGuess, valueTarget };
  q("vg-guess").style.setProperty("--at", pct(valueGuess / 255 * 100));
  q("vg-target").style.setProperty("--at", pct(valueTarget / 255 * 100));

  for (const [id, point] of [["pin-guess", guess], ["pin-target", target], ["ripple-guess-a", guess], ["ripple-guess-b", guess], ["ripple-hit-a", target], ["ripple-hit-b", target]]) {
    q(id).style.setProperty("--x", pct(point.x));
    q(id).style.setProperty("--y", pct(point.y));
  }
  mapWorld.style.setProperty("--gx", pct(guess.x));
  mapWorld.style.setProperty("--gy", pct(guess.y));
  q("map-flash").style.setProperty("--tx", pct(target.x));
  q("map-flash").style.setProperty("--ty", pct(target.y));
  setTicker(SITCON_GREEN);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showFinal(data);
    return;
  }

  // Reset to the pre-reveal state.
  revealRoot.dataset.reveal = "running";
  skipButton.hidden = false;
  const staged = [".vgauge", ".vg-mark", ".pin", ".range-tag", ".map-lines", ".tac-card", ".stamp", ".ticker-window", ".map-world"];
  revealRoot.querySelectorAll(staged.join()).forEach(element => element.classList.remove("on", "out", "go", "thump", "hot"));
  revealRoot.querySelectorAll(".ripple, .map-flash").forEach(element => element.classList.remove("go", "late"));
  setLine(guess, guess);
  q("spark").style.opacity = "";
  setGauge(valueGuess, valueGuess);
  q("vg-tag").textContent = "";
  q("range-tag").textContent = "0.0";
  q("distance").textContent = "0.0";
  q("score-points").textContent = "0";
  q("tac-fill").style.width = "0%";

  const events = [
    [0, () => q("pin-guess").classList.add("on")],
    [TIMELINE.land, () => {
      restart(q("ripple-guess-a"), "go");
      q("ripple-guess-b").classList.add("late");
      restart(q("ripple-guess-b"), "go");
      restart(q("map"), "thump");
    }],
    [TIMELINE.pull, () => mapWorld.classList.add("out")],
    [TIMELINE.fly, () => {
      q("range-tag").classList.add("on");
      revealRoot.querySelector(".map-lines").classList.add("on");
    }],
    [TIMELINE.hit, () => {
      setLine(guess, target);
      q("spark").style.opacity = "0";
      q("pin-target").classList.add("on");
      q("ripple-hit-b").classList.add("late");
      for (const id of ["ripple-hit-a", "ripple-hit-b", "map-flash"]) restart(q(id), "go");
      restart(q("map"), "thump");
    }],
    [TIMELINE.gauge, () => q("vgauge").classList.add("on")],
    [TIMELINE.card, () => q("tac-card").classList.add("on")],
    [TIMELINE.stamp, () => {
      q("grade").classList.add("on");
      restart(q("tac-card"), "thump");
    }],
    [TIMELINE.ticker, () => q("ticker-track").parentElement.classList.add("on")],
  ];

  const started = performance.now();
  const total = TIMELINE.ticker + 700;
  let frame = 0;
  let next = 0;

  function tick(now) {
    const elapsed = now - started;
    while (next < events.length && elapsed >= events[next][0]) events[next++][1]();

    if (elapsed >= TIMELINE.fly && elapsed < TIMELINE.hit) {
      const progress = easeOutQuint(Math.min(1, (elapsed - TIMELINE.fly) / TIMELINE.flyLength));
      const head = { x: guess.x + (target.x - guess.x) * progress, y: guess.y + (target.y - guess.y) * progress };
      setLine(guess, head);
      mapWorld.style.setProperty("--mx", pct((guess.x + head.x) / 2));
      mapWorld.style.setProperty("--my", pct((guess.y + head.y) / 2));
      q("range-tag").textContent = (displayed * progress).toFixed(1);
    } else if (elapsed >= TIMELINE.hit && next > 4) {
      mapWorld.style.setProperty("--mx", pct(mid.x));
      mapWorld.style.setProperty("--my", pct(mid.y));
      q("range-tag").textContent = displayed.toFixed(1);
      q("distance").textContent = displayed.toFixed(1);
    }

    if (elapsed >= TIMELINE.gauge && elapsed < TIMELINE.gauge + TIMELINE.gaugeLength + 50) {
      const progress = easeOutQuint(Math.min(1, (elapsed - TIMELINE.gauge) / TIMELINE.gaugeLength));
      const head = valueGuess + (valueTarget - valueGuess) * progress;
      setGauge(valueGuess, head);
      q("vg-tag").textContent = gaugeText(Math.round((valueGuess - valueTarget) * progress));
      if (progress === 1 && !q("vg-target").classList.contains("hot")) q("vg-target").classList.add("hot");
    }

    if (elapsed >= TIMELINE.bar) {
      const progress = easeOut(Math.min(1, (elapsed - TIMELINE.bar) / TIMELINE.barLength));
      q("tac-fill").style.width = score / 10 * progress + "%";
      q("score-points").textContent = Math.round(score * progress);
    }

    if (elapsed < total) frame = requestAnimationFrame(tick);
    else finish();
  }

  function finish() {
    showFinal(data);
    current = null;
  }

  current = {
    cancel() {
      cancelAnimationFrame(frame);
    },
    skip() {
      this.cancel();
      showFinal(data);
      current = null;
    },
  };
  frame = requestAnimationFrame(tick);
}

skipButton.addEventListener("click", () => current?.skip());
q("map").addEventListener("click", () => current?.skip());
