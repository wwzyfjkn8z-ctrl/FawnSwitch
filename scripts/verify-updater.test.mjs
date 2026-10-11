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

test("prepares draft API links as public versioned downloads", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fawn-updater-test-"));
  try {
    const apiUrl = "https://api.github.com/repos/wwzyfjkn8z-ctrl/FawnSwitch/releases/assets/123";
    const file = path.join(temp, "latest.json");
    const releaseFile = path.join(temp, "release.json");
    fs.writeFileSync(file, JSON.stringify({ platforms: { "darwin-aarch64": { url: apiUrl, signature: "unchanged" } } }));
    fs.writeFileSync(releaseFile, JSON.stringify({ tagName: "v0.2.8", isDraft: true, assets: [{ apiUrl, name: "Fawn.Switch.app.tar.gz" }] }));
    const run = () => spawnSync(process.execPath, ["scripts/prepare-updater.mjs", file, releaseFile, "v0.2.8"]).status;
    assert.equal(run(), 0);
    const artifact = JSON.parse(fs.readFileSync(file)).platforms["darwin-aarch64"];
    assert.equal(artifact.url, "https://github.com/wwzyfjkn8z-ctrl/FawnSwitch/releases/download/v0.2.8/Fawn.Switch.app.tar.gz");
    assert.equal(artifact.signature, "unchanged");
    fs.writeFileSync(file, JSON.stringify({ platforms: { unknown: { url: "https://example.com/update" } } }));
    assert.notEqual(run(), 0);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
