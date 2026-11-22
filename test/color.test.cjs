const assert = require("node:assert/strict");
const test = require("node:test");
const { randomStartingColor, colorAfterTilt, hsvToRgb, rgbToHsv, scoreFromDistance, hexColor, compareWithSitcon, describeScore, describeColorDifference, rankAmongRgbColors, randomGuessComparison } = require("../color.js");

test("a fresh draw changes all three starting controls", t => {
  let draw = 0.25;
  t.mock.method(Math, "random", () => draw);
  const first = randomStartingColor();
  draw = 0.75;
  const second = randomStartingColor();
  for (const key of ["hue", "saturation", "value"]) assert.notEqual(first[key], second[key]);
  assert.notDeepEqual(hsvToRgb(first), hsvToRgb(second));
});

test("the wheel covers the spectrum, including white and black", () => {
  const rim = [[255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255]];
  rim.forEach((rgb, index) => {
    assert.deepEqual(hsvToRgb({ hue: index * 60, saturation: 1, value: 255 }), rgb);
  });
  assert.deepEqual(hsvToRgb({ hue: 360, saturation: 0, value: 255 }), [255, 255, 255]);
  assert.deepEqual(hsvToRgb({ hue: 180, saturation: 1, value: 0 }), [0, 0, 0]);
});

test("the official green is reachable with the wheel and brightness alone", () => {
  const guess = hsvToRgb({ hue: 101, saturation: 0.503, value: 181 });
  assert.equal(hexColor(guess), "#77B55A");
  assert.equal(compareWithSitcon(guess).distance, 0);
});

test("a calibrated tilt ignores hand tremor and can reach the opposite rim", () => {
  const origin = { hue: 90, saturation: 1, value: 181 };
  assert.deepEqual(colorAfterTilt(origin, 0.014, -0.02), { hue: 90, saturation: 1 });
  assert.deepEqual(colorAfterTilt(origin, -0.9, 0), { hue: 270, saturation: 1 });
  const center = { hue: 45, saturation: 0 };
  assert.equal(colorAfterTilt(center, 0, 0.25).hue, 180);
  assert.equal(colorAfterTilt(center, 0.25, 0).hue, 90);
});

test("the score uses signed guess-minus-target channels and RGB Euclidean distance", () => {
  assert.equal(hexColor([119, 181, 90]), "#77B55A");
  assert.deepEqual(compareWithSitcon([119, 181, 90]), { differences: [0, 0, 0], distance: 0 });
  assert.deepEqual(compareWithSitcon([122, 177, 102]), { differences: [3, -4, 12], distance: 13 });
});

test("grades use the displayed distance, including both sides of each threshold", () => {
  const cases = [
    [0, "正港標準綠"], [1, "機房乖乖綠"], [5, "機房乖乖綠"], [5.1, "一塊綠豆糕"],
    [Math.sqrt(401), "一塊綠豆糕"], [20.1, "便當三色豆"], [50, "便當三色豆"],
    [50.1, "綠線坐過站"], [100, "綠線坐過站"], [100.1, "下一站綠島"],
  ];
  for (const [distance, name] of cases) assert.equal(describeScore(distance).grade.name, name);
});

test("RGB rank counts closer colors, preserves ties and stops at the RGB cube edges", () => {
  assert.equal(rankAmongRgbColors([0, 0, 0]), 1);
  assert.equal(rankAmongRgbColors([1, 0, 0]), 2);
  assert.equal(rankAmongRgbColors([0, -1, 0]), 2);
  assert.equal(rankAmongRgbColors([1, 1, 0]), 8);
  assert.equal(rankAmongRgbColors([136, -181, 165]), 256 ** 3);
});

test("the share verdict describes the player's actual difference from the target", () => {
  assert.equal(describeScore(0).grade.verdict, "完全同色");
  assert.equal(describeScore(28.8).grade.verdict, "接近了");
  assert.match(describeColorDifference([0, 0, 0]), /都相同/);
  assert.match(describeColorDifference([16, 0, 24]), /比標準綠亮/);
  assert.match(describeColorDifference([-16, 0, -24]), /比標準綠暗/);
  assert.match(describeColorDifference([-5, 3, 12]), /藍色分量偏多/);
  assert.match(describeColorDifference([2, -18, 7]), /綠色分量偏少/);
});

test("random color odds distinguish exact matches from very small probabilities", () => {
  assert.match(randomGuessComparison(1), /唯一/);
  assert.match(randomGuessComparison(2), /不到 0.01%/);
  assert.match(randomGuessComparison(256 ** 3 / 2 + 1), /約 50%/);
  assert.match(randomGuessComparison(256 ** 3), /超過 99.99%/);
});

test("rgbToHsv inverts hsvToRgb for the wheel's colors", () => {
  for (const rgb of [[119, 181, 90], [255, 0, 0], [0, 0, 255], [10, 200, 220], [255, 255, 255], [0, 0, 0], [200, 30, 120]]) {
    assert.deepEqual(hsvToRgb(rgbToHsv(rgb)), rgb);
  }
  assert.equal(rgbToHsv([0, 255, 0]).hue, 120);
  assert.equal(rgbToHsv([128, 128, 128]).saturation, 0);
});

test("the point score falls with distance and only an exact match is perfect", () => {
  assert.equal(scoreFromDistance(0), 1000);
  assert.equal(scoreFromDistance(0.05), 999);
  assert.ok(scoreFromDistance(5) > scoreFromDistance(20));
  assert.ok(scoreFromDistance(20) > scoreFromDistance(100));
  assert.ok(scoreFromDistance(441.7) >= 0);
});

test("the result camera zooms only when the two pins are close, and eases toward their midpoint", () => {
  const { fitZoom, fitFocus } = require("../card.js");
  assert.equal(fitZoom({ x: 10, y: 10 }, { x: 90, y: 90 }), 1);
  assert.equal(fitZoom({ x: 50, y: 50 }, { x: 54.5, y: 50 }), 10 > 5 ? 5 : 0);
  assert.deepEqual(fitFocus({ x: 80, y: 20 }, 1), { x: 50, y: 50 });
  assert.deepEqual(fitFocus({ x: 80, y: 20 }, 2.5), { x: 80, y: 20 });
});
