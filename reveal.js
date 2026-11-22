"use strict";

// Result reveal: the color wheel is the "map", the player's color is the guess
// pin, and SITCON green is the landmark. Visuals and synthesized sound share one
// timeline (milliseconds from the moment the result screen opens).
const q = id => document.getElementById(id);
const TIMELINE = { land: 450, pull: 800, fly: 1950, flyLength: 700, hit: 2650, gauge: 2850, gaugeLength: 500, card: 3550, bar: 3800, barLength: 1000, stamp: 4850, ticker: 5200 };
const SOUND_KEY = "color-challenge-sound";

const revealRoot = q("result");
const mapWorld = q("map-world");
const soundToggle = q("sound-toggle");
const skipButton = q("skip-reveal");
const targetHsv = rgbToHsv(SITCON_GREEN);

let soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== "off"; } catch { /* storage may be blocked */ }
let audioContext = null;
let current = null;

function wheelPosition({ hue, saturation }) {
  const angle = hue * Math.PI / 180;
  return { x: 50 + Math.sin(angle) * saturation * 50, y: 50 - Math.cos(angle) * saturation * 50 };
}

function renderSoundToggle() {
  soundToggle.setAttribute("aria-pressed", String(soundOn));
  soundToggle.textContent = soundOn ? "音效：開" : "音效：關";
}

soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch { /* ignore */ }
  renderSoundToggle();
  if (!soundOn) current?.mute();
});
renderSoundToggle();

// Browsers only allow audio after a gesture. Prepare it on the first one.
function unlockAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  audioContext ??= new Context();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
}
for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, unlockAudio, { capture: true, passive: true });

// ---- Sound design -------------------------------------------------------
function createSynth(ctx) {
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  master.gain.value = 0.6;
  master.connect(compressor).connect(ctx.destination);

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  function envelope(t, dur, gain, attack) {
    const node = ctx.createGain();
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(gain, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return node;
  }

  function tone(t, { type = "sine", from, to = from, dur, gain = 0.2, attack = 0.005, lowpass }) {
    const osc = ctx.createOscillator();
    const amp = envelope(t, dur, gain, attack);
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpass;
      osc.connect(filter).connect(amp);
    } else {
      osc.connect(amp);
    }
    amp.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(t, { type = "lowpass", from, to = from, dur, gain = 0.3, attack = 0.003 }) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = envelope(t, dur, gain, attack);
    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    source.connect(filter).connect(amp).connect(master);
    source.start(t);
    source.stop(t + dur + 0.05);
  }

  function heavyHit(t, depth = 1) {
    tone(t, { from: 150, to: 38, dur: 0.42, gain: 0.9 * depth });
    tone(t, { type: "square", from: 78, to: 40, dur: 0.16, gain: 0.22 * depth, lowpass: 400 });
    noise(t, { from: 900, to: 120, dur: 0.14, gain: 0.55 * depth });
    tone(t + 0.005, { type: "triangle", from: 1400, to: 500, dur: 0.07, gain: 0.08 * depth });
  }

  return {
    master,
    scan(t) {
      tone(t, { type: "sawtooth", from: 160, to: 1500, dur: 0.43, gain: 0.07, attack: 0.05, lowpass: 1800 });
      tone(t, { from: 420, to: 3400, dur: 0.43, gain: 0.05, attack: 0.05 });
    },
    land: t => heavyHit(t),
    pull: t => noise(t, { type: "bandpass", from: 350, to: 2200, dur: 0.8, gain: 0.16, attack: 0.25 }),
    laser(t) {
      tone(t, { type: "sawtooth", from: 2600, to: 420, dur: 0.28, gain: 0.07, lowpass: 3200 });
      for (let step = 1; step <= 16; step++) {
        // Tick when the eased line position crosses each 1/16 of the way.
        const at = t + (1 - (1 - step / 16) ** (1 / 3)) * TIMELINE.flyLength / 1000;
        tone(at, { type: "square", from: 1900, to: 1500, dur: 0.035, gain: 0.07, lowpass: 5000 });
      }
    },
    hit(t) {
      for (const freq of [261.63, 329.63, 392, 523.25, 659.25]) {
        tone(t, { type: "sawtooth", from: freq, dur: 1.2, gain: 0.07, attack: 0.012, lowpass: 2400 });
        tone(t, { type: "triangle", from: freq * 2, dur: 0.9, gain: 0.04, attack: 0.012 });
      }
      tone(t, { from: 130, to: 65, dur: 0.5, gain: 0.5 });
      tone(t + 0.02, { from: 1568, dur: 0.7, gain: 0.07 });
      noise(t, { type: "bandpass", from: 3200, to: 300, dur: 0.45, gain: 0.3 });
    },
    gauge(t) {
      tone(t, { type: "sawtooth", from: 700, to: 2200, dur: 0.3, gain: 0.05, lowpass: 3000 });
      for (let step = 1; step <= 8; step++) {
        const at = t + (1 - (1 - step / 8) ** (1 / 3)) * TIMELINE.gaugeLength / 1000;
        tone(at, { type: "square", from: 1700, to: 1400, dur: 0.03, gain: 0.05, lowpass: 5000 });
      }
      tone(t + TIMELINE.gaugeLength / 1000, { from: 1318, dur: 0.3, gain: 0.08 });
    },
    card: t => noise(t, { type: "bandpass", from: 300, to: 1600, dur: 0.3, gain: 0.12, attack: 0.08 }),
    bar(t, dur) {
      tone(t, { type: "triangle", from: 260, to: 1200, dur, gain: 0.1, attack: 0.05 });
      for (let i = 0; i < 12; i++) tone(t + i * dur / 12, { from: 1300 + i * 70, dur: 0.06, gain: 0.04 });
    },
    stamp(t) {
      heavyHit(t, 0.9);
      tone(t, { type: "triangle", from: 880, to: 760, dur: 0.35, gain: 0.06 });
    },
    ticker(t) {
      for (let i = 0; i < 3; i++) tone(t + i * 0.07, { type: "square", from: 1400, dur: 0.05, gain: 0.04, lowpass: 4000 });
    },
  };
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

  let synth = null;
  let startAudio = 0;
  if (soundOn && audioContext && audioContext.state !== "closed") {
    synth = createSynth(audioContext);
    startAudio = audioContext.currentTime + 0.06;
    const at = ms => startAudio + ms / 1000;
    synth.scan(at(0));
    synth.land(at(TIMELINE.land));
    synth.pull(at(TIMELINE.pull));
    synth.laser(at(TIMELINE.fly));
    synth.hit(at(TIMELINE.hit));
    synth.gauge(at(TIMELINE.gauge));
    synth.card(at(TIMELINE.card));
    synth.bar(at(TIMELINE.bar), TIMELINE.barLength / 1000);
    synth.stamp(at(TIMELINE.stamp));
    synth.ticker(at(TIMELINE.ticker));
  }

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
    synth?.master.gain.setTargetAtTime(0, audioContext.currentTime + 2, 0.3);
    showFinal(data);
    current = null;
  }

  current = {
    cancel() {
      cancelAnimationFrame(frame);
      if (synth) {
        synth.master.gain.cancelScheduledValues(0);
        synth.master.gain.setTargetAtTime(0, audioContext.currentTime, 0.03);
      }
    },
    mute() {
      synth?.master.gain.setTargetAtTime(0, audioContext.currentTime, 0.03);
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
