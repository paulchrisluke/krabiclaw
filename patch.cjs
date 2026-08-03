const fs = require('fs');
const candidates = [
  '.output/server/chunks/nitro/nitro.mjs',
  '.output/server/chunks/_/nitro.mjs',
];
const p = candidates.find((candidate) => fs.existsSync(candidate));
if (!p) {
  throw new Error(`Unable to find Nitro server chunk. Checked: ${candidates.join(', ')}`);
}
const src = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p, src.replace(/Reflect\.get\(([a-z]),([a-z]),(?!\1)([a-z])\)/g, (_, t, r) => 'Reflect.get('+t+','+r+','+t+')'));
console.log(`Patched successfully: ${p}`);

const publicSurfaceCssPaths = {
  'platform-entry': 'surfaces/platform.css',
  'saya-entry': 'surfaces/saya.css',
  'blawby-entry': 'surfaces/blawby.css',
};
const precomputedManifestPath = '.output/server/chunks/build/client.precomputed.mjs';
if (!fs.existsSync(precomputedManifestPath)) {
  throw new Error(`Unable to find Nuxt client preload manifest: ${precomputedManifestPath}`);
}

let precomputedManifest = fs.readFileSync(precomputedManifestPath, 'utf8');
for (const [sourceName, targetPath] of Object.entries(publicSurfaceCssPaths)) {
  const publicAssetPath = `.output/public/_nuxt/${targetPath}`;
  if (!fs.existsSync(publicAssetPath)) {
    throw new Error(`Missing public surface stylesheet: ${publicAssetPath}`);
  }

  const sourcePattern = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hashPattern = '[A-Za-z0-9_-]+';
  precomputedManifest = precomputedManifest
    .replace(new RegExp(`/_nuxt/(?:assets/)?surfaces/${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `/_nuxt/${targetPath}`)
    .replace(new RegExp(`/_nuxt/${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `/_nuxt/${targetPath}`)
    .replace(new RegExp(`(^|[^A-Za-z0-9_/-])assets/surfaces/${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `$1${targetPath}`)
    .replace(new RegExp(`(^|[^A-Za-z0-9_/-])${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `$1${targetPath}`);
}
const staleSurfaceCss = Object.keys(publicSurfaceCssPaths)
  .filter(sourceName => new RegExp(`${sourceName}\\.[A-Za-z0-9_-]+\\.css`).test(precomputedManifest));
if (staleSurfaceCss.length > 0) {
  throw new Error(`Stale public surface stylesheet references remain: ${staleSurfaceCss.join(', ')}`);
}
fs.writeFileSync(precomputedManifestPath, precomputedManifest);
console.log(`Patched successfully: ${precomputedManifestPath}`);
