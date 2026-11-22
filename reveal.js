"use strict";

const q = id => document.getElementById(id);

const revealRoot = q("result");
const mapWorld = q("map-world");
const targetHsv = rgbToHsv(SITCON_GREEN);

function wheelPosition({ hue, saturation }) {
  const angle = hue * Math.PI / 180;
  return { x: 50 + Math.sin(angle) * saturation * 50, y: 50 - Math.cos(angle) * saturation * 50 };
}

const pct = value => value.toFixed(2) + "%";

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
}

function playReveal({ selection, displayed, score }) {
  const guess = wheelPosition(selection);
  const target = wheelPosition(targetHsv);
  const mid = { x: (guess.x + target.x) / 2, y: (guess.y + target.y) / 2 };
  // Close pins get a "zoom to fit" so the distance tag has room.
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
  showFinal(data);
}
