import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const platforms = ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"];
function verify(modify = () => {}) {
  const manifest = { version: "0.2.8", platforms: Object.fromEntries(platforms.map((p) => [p, { signature: "test-signature", url: `https://github.com/wwzyfjkn8z-ctrl/FawnSwitch/releases/download/v0.2.8/${p}.tar.gz` }])) };
  modify(manifest);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fawn-updater-test-"));
  try {
    const file = path.join(temp, "latest.json");
    fs.writeFileSync(file, JSON.stringify(manifest));
    return spawnSync(process.execPath, ["scripts/verify-updater.mjs", file, "v0.2.8"]).status;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
test("requires all platforms and dedicated release URLs", () => {
  assert.equal(verify(), 0);
  assert.notEqual(verify((m) => { delete m.platforms["windows-x86_64"]; }), 0);
  assert.notEqual(verify((m) => { m.platforms["darwin-aarch64"].url = "https://github.com/other/repo/releases/download/v0.2.8/update"; }), 0);
});
test("rejects missing signatures and mismatched versions", () => {
  assert.notEqual(verify((m) => { m.platforms["darwin-aarch64"].signature = ""; }), 0);
  assert.notEqual(verify((m) => { m.version = "0.2.9"; }), 0);
});
