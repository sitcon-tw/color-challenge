const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("the offline-exportable logo uses the original SITCON SVG bytes", () => {
  const root = path.join(__dirname, "..");
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const logo = html.match(/<img\b[^>]*\bid="official-logo"[^>]*>/)?.[0];
  const data = logo?.match(/src="data:image\/svg\+xml;base64,([^"]+)"/)?.[1];
  assert.ok(data, "the reference logo must also work on a file:// canvas");
  assert.deepEqual(Buffer.from(data, "base64"), readFileSync(path.join(root, "assets/logo.svg")));
});
