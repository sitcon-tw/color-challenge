const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");
const { describeScore, scoreFromDistance, describeColorDifference } = require("../color.js");

test("the offline-exportable logo uses the original SITCON SVG bytes", () => {
  const root = path.join(__dirname, "..");
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const logo = html.match(/<img\b[^>]*\bid="official-logo"[^>]*>/)?.[0];
  const data = logo?.match(/src="data:image\/svg\+xml;base64,([^"]+)"/)?.[1];
  assert.ok(data, "the reference logo must also work on a file:// canvas");
  assert.deepEqual(Buffer.from(data, "base64"), readFileSync(path.join(root, "assets/logo.svg")));
});

test("local and preview rounds share the public challenge and matching results", () => {
  const script = readFileSync(path.join(__dirname, "..", "share.js"), "utf8");
  const gameUrl = "https://sitcon.org/color-challenge/";
  const cases = [
    { page: "file:///tmp/color-challenge/index.html", kind: "oneshot", mode: "一發入魂 · 用時 3 秒", differences: [0, 0, 0], rotation: 180, spinLabel: "" },
    { page: "http://192.168.1.2:8080/preview/?pr=1", kind: "gyro", mode: "陀螺儀 · 用時 7 秒", differences: [-91, -158, 104], rotation: 0, spinLabel: "色盤轉了 180°" },
  ];
  for (const { page, kind, mode, differences, rotation, spinLabel } of cases) {
    const elements = new Map();
    function byId(id) {
      if (!elements.has(id)) elements.set(id, { addEventListener() {} });
      return elements.get(id);
    }
    const app = { byId, window: {}, location: new URL(page), describeColorDifference };
    runInNewContext(script, app);

    const distance = Math.hypot(...differences);
    const round = { kind, mode, differences, rotation, spinLabel, score: scoreFromDistance(distance), ...describeScore(distance) };
    app.prepareShare(round);
    assert.equal(round.gameUrl, gameUrl);
    const caption = byId("share-text").value;
    const [intro, result, timing, difference] = caption.split("\n");
    assert.match(intro, /^我.*SITCON 綠.*拿到/);
    assert.ok(intro.includes(round.grade.name));
    assert.match(intro, kind === "oneshot" ? /各點一次/ : /傾斜手機/);
    assert.ok(result.includes(round.grade.verdict));
    assert.ok(result.includes(`${round.score} 分`));
    assert.equal(result.match(/1000/g).length, 1);
    assert.equal(timing, spinLabel ? `${mode} · ${spinLabel}` : mode);
    assert.ok(difference.startsWith("RGB 距離 "));
    assert.ok(!caption.includes(describeColorDifference(differences)));
    assert.ok(caption.endsWith(gameUrl));
    assert.match(round.invitation, distance === 0 ? /滿分/ : /比我/);

    round.cards = { story: { url: "blob:story" }, post: { url: "blob:post" } };
    for (const format of ["story", "post"]) {
      app.previewCard(format);
      const preview = byId("share-preview");
      assert.match(preview.alt, /左邊.*我的選色，右邊.*標準綠/);
      assert.equal(preview.src, round.cards[format].url);
      for (const value of [caption, preview.alt]) {
        assert.deepEqual(value.match(/色盤轉了 \d+°/g) ?? [], spinLabel ? [spinLabel] : []);
        for (const fact of [round.grade.name, round.grade.verdict, `${round.score} 分`, `RGB 距離 ${round.displayed.toFixed(1)}`, mode, gameUrl]) {
          assert.ok(value.includes(fact), fact);
        }
      }
    }
  }
});
