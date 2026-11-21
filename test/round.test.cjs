const assert = require("node:assert/strict");
const test = require("node:test");
const { Round } = require("../round.js");

const initial = { hue: 120, saturation: 0.5, value: 150 };

test("the countdown waits for a change and rejects a pick at its deadline", () => {
  for (const [control, values] of [["wheel", { hue: 90 }], ["brightness", { value: 128 }]]) {
    const round = new Round("timed", initial);
    assert.equal(round.pick("wheel", { hue: initial.hue }, false, 10), false);
    assert.equal(round.elapsed(60_000), 0);
    assert.equal(round.expired(60_000), false);
    assert.equal(round.pick(control, values, false, 70_000), true);
    assert.equal(round.pick("brightness", { value: 181 }, false, 99_999), true);
    assert.equal(round.resultTime(99_999), "用時 29.9 秒");
    assert.equal(round.pick("brightness", { value: 255 }, false, 100_000), false);
    assert.equal(round.selection.value, 181);
    assert.equal(round.resultTime(150_000), "時間到");
  }
});

test("the stopwatch includes only time since the first adjustment", () => {
  const round = new Round("normal", initial);
  assert.equal(round.resultTime(50_000), "用時 0 秒");
  round.pick("brightness", { value: 0 }, false, 50_000);
  assert.equal(round.resultTime(50_030), "用時不到 0.1 秒");
  round.pick("wheel", { hue: 180 }, false, 61_000);
  assert.equal(round.resultTime(112_345), "用時 1 分 2.3 秒");
  assert.equal(round.expired(112_345), false);
});

test("one shot locks each control on its first press in either order", () => {
  const picks = [["wheel", { hue: 200, saturation: 1 }], ["brightness", { value: initial.value }]];
  for (const [first, second] of [picks, [...picks].reverse()]) {
    const round = new Round("oneshot", initial);
    assert.equal(round.pick(...first, true, 500), true);
    assert.equal(round.locked.size, 1);
    const correction = first[0] === "wheel" ? { hue: 0 } : { value: 0 };
    assert.equal(round.pick(first[0], correction, false, 600), false);
    assert.equal(round.pick(first[0], correction, true, 700), false);
    assert.equal(round.pick(...second, true, 1750), true);
    assert.equal(round.locked.size, 2);
    assert.deepEqual(round.selection, { hue: 200, saturation: 1, value: initial.value });
    assert.equal(round.resultTime(1750), "用時 1.2 秒");
  }
});

test("keyboard aiming reveals only the control that has been locked", () => {
  const round = new Round("oneshot", initial);
  round.pick("brightness", { value: 42 }, false, 100);
  round.pick("wheel", { hue: 5 }, false, 200);
  assert.deepEqual(round.selection, initial);
  round.pick("wheel", { hue: 5 }, true, 300);
  assert.equal(round.selection.value, initial.value);
  assert.equal(round.aim.value, 42);
  round.pick("brightness", { value: 42 }, true, 400);
  assert.deepEqual(round.selection, round.aim);
});
