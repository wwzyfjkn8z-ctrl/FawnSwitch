import fs from "node:fs";
import assert from "node:assert/strict";
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const tag = process.argv[3];
assert.equal(manifest.version.replace(/^v/, ""), tag.replace(/^v/, ""));
for (const platform of ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]) {
  const artifact = manifest.platforms?.[platform];
  assert.ok(artifact?.signature?.trim(), `Missing signature: ${platform}`);
  const url = new URL(artifact.url);
  assert.equal(url.origin, "https://github.com");
  assert.ok(url.pathname.startsWith(`/wwzyfjkn8z-ctrl/FawnSwitch/releases/download/${tag}/`), `Unexpected URL for ${platform}`);
}
console.log("All updater platforms have dedicated release URLs and signatures");
