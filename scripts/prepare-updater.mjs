import fs from "node:fs";
import assert from "node:assert/strict";
const [file, releaseFile, tag] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const release = JSON.parse(fs.readFileSync(releaseFile, "utf8"));
assert.equal(release.tagName, tag);
assert.equal(release.isDraft, true);
const assets = new Map(release.assets.map((asset) => [asset.apiUrl, `https://github.com/wwzyfjkn8z-ctrl/FawnSwitch/releases/download/${tag}/${encodeURIComponent(asset.name)}`]));
for (const artifact of Object.values(manifest.platforms)) {
  const url = assets.get(artifact.url) ?? artifact.url;
  assert.ok(url.startsWith(`https://github.com/wwzyfjkn8z-ctrl/FawnSwitch/releases/download/${tag}/`), "Unexpected updater asset");
  artifact.url = url;
}
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
