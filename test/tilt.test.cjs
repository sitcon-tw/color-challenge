const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");

test("leaving a round while its sensor permission prompt is open discards the answer", async () => {
  let answer;
  const permission = new Promise(resolve => { answer = resolve; });
  const window = { DeviceOrientationEvent: { requestPermission: () => permission } };
  const source = readFileSync(path.join(__dirname, "../tilt.js"), "utf8");
  const followTilt = runInNewContext(source + "\nfollowTilt", { window });
  const controller = new AbortController();
  const states = [];
  const pending = followTilt(controller.signal, assert.fail, assert.fail, state => states.push(state));
  controller.abort();
  answer("granted");
  await pending;
  assert.deepEqual(states, ["permission"]);
});
