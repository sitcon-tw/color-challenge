"use strict";

// SITCON 品牌使用規範 https://sitcon.org/branding/
const SITCON_GREEN = [119, 181, 90];
const RGB_COLORS = 256 ** 3;
const GRADES = [
  { max: 0, verdict: "完全同色", name: "正港標準綠", line: "三個色值一格都沒差，SITCON 綠本尊來啦！" },
  { max: 5, verdict: "幾乎一模一樣", name: "機房乖乖綠", line: "才差這幾格，先別驚動機房那包綠色乖乖。" },
  { max: 20, verdict: "非常接近", name: "一塊綠豆糕", line: "遠看是 SITCON 綠，湊近一看，真像一塊綠豆糕。" },
  { max: 50, verdict: "接近了", name: "便當三色豆", line: "本來只想夾青豆，玉米和紅蘿蔔也一起上了湯匙。" },
  { max: 100, verdict: "還差一截", name: "綠線坐過站", line: "有搭上捷運綠線，只是坐過站了啦！" },
  { max: Infinity, verdict: "差得有點遠", name: "下一站綠島", line: "說好要找 SITCON 綠，你的色票怎麼搭船去綠島了？" },
];

function randomStartingColor() {
  // Weight saturation and brightness by their volume in the RGB cube.
  return {
    hue: Math.random() * 360,
    saturation: Math.sqrt(Math.random()),
    value: Math.round(255 * Math.cbrt(Math.random())),
  };
}

function colorAtWheelPoint(x, y, previousHue) {
  const saturation = Math.min(1, Math.hypot(x, y));
  const hue = saturation < 1e-12 ? previousHue : (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
  return { hue, saturation };
}

function colorAfterTilt(origin, right, down) {
  const length = Math.hypot(right, down);
  // Ignore about two degrees of hand tremor around the calibrated grip.
  const deadZone = 0.035;
  if (length <= deadZone) return { hue: origin.hue, saturation: origin.saturation };
  const gain = 3 * (1 - deadZone / length);
  const angle = origin.hue * Math.PI / 180;
  const x = Math.sin(angle) * origin.saturation + right * gain;
  const y = -Math.cos(angle) * origin.saturation + down * gain;
  return colorAtWheelPoint(x, y, origin.hue);
}

// Hue runs clockwise in degrees, saturation from 0 to 1, and value from 0 to 255.
function hsvToRgb({ hue, saturation, value }) {
  const sector = (hue % 360) / 60;
  const chroma = value * saturation;
  const middle = chroma * (1 - Math.abs(sector % 2 - 1));
  const channels = [
    [chroma, middle, 0], [middle, chroma, 0], [0, chroma, middle],
    [0, middle, chroma], [middle, 0, chroma], [chroma, 0, middle],
  ][Math.floor(sector)];
  return channels.map(channel => Math.round(channel + (value - chroma)));
}

function rgbToHsv([red, green, blue]) {
  const value = Math.max(red, green, blue);
  const delta = value - Math.min(red, green, blue);
  let hue = 0;
  if (delta) {
    const sector = value === red ? ((green - blue) / delta + 6) % 6
      : value === green ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
    hue = sector * 60;
  }
  return { hue, saturation: value ? delta / value : 0, value };
}

function hexColor(rgb) {
  return "#" + rgb.map(channel => channel.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function compareWithSitcon(rgb) {
  const differences = rgb.map((channel, index) => channel - SITCON_GREEN[index]);
  return { differences, distance: Math.hypot(...differences) };
}

function describeScore(distance) {
  const displayed = Number(distance.toFixed(1));
  return { displayed, grade: GRADES.find(grade => displayed <= grade.max) };
}

// Points out of 1000. Only an exact match earns all of them.
function scoreFromDistance(distance) {
  if (distance === 0) return 1000;
  return Math.min(999, Math.round(1000 * Math.exp(-distance / 60)));
}

function describeColorDifference(differences) {
  if (differences.every(delta => delta === 0)) return "紅、綠、藍三個色值都相同。";
  if (differences.every(delta => delta >= 0)) return "我調的顏色比標準綠亮。";
  if (differences.every(delta => delta <= 0)) return "我調的顏色比標準綠暗。";
  const largest = Math.max(...differences.map(Math.abs));
  const channel = differences.findIndex(delta => Math.abs(delta) === largest);
  const name = ["紅", "綠", "藍"][channel];
  return `跟標準綠比，我的${name}色分量偏${differences[channel] > 0 ? "多" : "少"}。`;
}

function describeBrightnessDifference(value, standard) {
  if (value === standard) return "明度相同";
  const percent = Number((Math.abs(value - standard) / standard * 100).toFixed(1));
  return `比標準${value > standard ? "亮" : "暗"} ${percent}%`;
}

function rankAmongRgbColors(differences) {
  const [red, green, blue] = SITCON_GREEN;
  // Squared RGB distances are integers. Subtract one to exclude all ties.
  const inside = differences.reduce((sum, delta) => sum + delta * delta, 0) - 1;
  let rank = 1;
  for (let r = 0; r <= 255; r++) {
    const crossSection = inside - (r - red) ** 2;
    if (crossSection < 0) continue;
    const reach = Math.floor(Math.sqrt(crossSection));
    for (let g = Math.max(0, green - reach); g <= Math.min(255, green + reach); g++) {
      const depth = Math.floor(Math.sqrt(crossSection - (g - green) ** 2));
      rank += Math.min(255, blue + depth) - Math.max(0, blue - depth) + 1;
    }
  }
  return rank;
}

function randomGuessComparison(rank) {
  if (rank === 1) return "你調中了唯一的標準綠，沒有其他 RGB 顏色更接近。";
  const percent = (rank - 1) / RGB_COLORS * 100;
  let odds = `約 ${Number(percent.toFixed(2))}%`;
  if (percent < 0.01) odds = "不到 0.01%";
  if (percent > 99.99) odds = "超過 99.99%";
  return `隨機挑一個 RGB 顏色，比你更接近標準綠的機率${odds}。`;
}

if (typeof module !== "undefined") module.exports = { randomStartingColor, colorAfterTilt, hsvToRgb, rgbToHsv, scoreFromDistance, hexColor, compareWithSitcon, describeScore, describeColorDifference, describeBrightnessDifference, rankAmongRgbColors, randomGuessComparison };
