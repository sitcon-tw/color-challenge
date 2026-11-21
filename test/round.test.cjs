const assert = require("node:assert/strict");
const test = require("node:test");
const { Round } = require("../round.js");

const initial = { hue: 120, saturation: 0.5, value: 150 };

test("the countdown waits for a change and rejects a pick at its deadline", () => {
  for (const values of [{ hue: 90 }, { value: 128 }]) {
    const round = new Round("timed", initial);
    assert.equal(round.pick({ hue: initial.hue }, 10), false);
    assert.equal(round.elapsed(60_000), 0);
    assert.equal(round.expired(60_000), false);
    assert.equal(round.pick(values, 70_000), true);
    assert.equal(round.pick({ value: 181 }, 99_999), true);
    assert.equal(round.resultTime(99_999), "用時 29.9 秒");
    assert.equal(round.pick({ value: 255 }, 100_000), false);
    assert.equal(round.selection.value, 181);
    assert.equal(round.resultTime(150_000), "時間到");
  }
});

test("the stopwatch includes only time since the first adjustment", () => {
  const round = new Round("normal", initial);
  assert.equal(round.resultTime(50_000), "用時 0 秒");
  round.pick({ value: 0 }, 50_000);
  assert.equal(round.resultTime(50_030), "用時不到 0.1 秒");
  round.pick({ hue: 180 }, 61_000);
  assert.equal(round.resultTime(112_345), "用時 1 分 2.3 秒");
  assert.equal(round.expired(112_345), false);
});
