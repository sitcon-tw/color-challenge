const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("the page requests its current JavaScript and CSS through versioned URLs", () => {
  const root = path.join(__dirname, "..");
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const assets = [...html.matchAll(/\b(?:src|href)="([\w./-]+\.(?:js|css))(?:\?([^"]*))?"/g)];
  assert.ok(assets.length, "expected local scripts and stylesheets in index.html");
  for (const [, file, query] of assets) {
    const bytes = readFileSync(path.join(root, file));
    const version = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    assert.equal(new URLSearchParams(query).get("v"), version, `use ${file}?v=${version} in index.html`);
  }
});
