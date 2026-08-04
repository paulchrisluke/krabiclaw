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
  'platform-home-entry': 'surfaces/platform-home.css',
  'saya-home-entry': 'surfaces/saya-home.css',
  'saya-entry': 'surfaces/saya.css',
  'blawby-home-entry': 'surfaces/blawby-home.css',
  'blawby-entry': 'surfaces/blawby.css',
};
const precomputedManifestCandidates = [
  '.output/server/chunks/_/client.precomputed.mjs',
  '.output/server/chunks/build/client.precomputed.mjs',
];
const precomputedManifestPath = precomputedManifestCandidates.find(candidate => fs.existsSync(candidate));
if (!precomputedManifestPath) {
  throw new Error(`Unable to find Nuxt client preload manifest. Checked: ${precomputedManifestCandidates.join(', ')}`);
}

let precomputedManifest = fs.readFileSync(precomputedManifestPath, 'utf8');
for (const [sourceName, targetPath] of Object.entries(publicSurfaceCssPaths)) {
  const publicAssetPath = `.output/public/_nuxt/${targetPath}`;
  if (!fs.existsSync(publicAssetPath)) {
    throw new Error(`Missing public surface stylesheet: ${publicAssetPath}`);
  }

  const surfaceCss = fs.readFileSync(publicAssetPath, 'utf8');
  fs.writeFileSync(publicAssetPath, surfaceCss.replace(/url\(\.\.\/fonts\//g, 'url(/fonts/'));

  const sourcePattern = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hashPattern = '[A-Za-z0-9_-]+';
  precomputedManifest = precomputedManifest
    .replace(new RegExp(`/_nuxt/(?:assets/)?surfaces/${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `/_nuxt/${targetPath}`)
    .replace(new RegExp(`/_nuxt/${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `/_nuxt/${targetPath}`)
    .replace(new RegExp(`(^|[^A-Za-z0-9_/-])assets/surfaces/${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `$1${targetPath}`)
    .replace(new RegExp(`(^|[^A-Za-z0-9_/-])${sourcePattern}\\.${hashPattern}\\.css`, 'g'), `$1${targetPath}`);
}

for (const targetPath of Object.values(publicSurfaceCssPaths)) {
  const publicAssetPath = `.output/public/_nuxt/${targetPath}`;
  const surfaceCss = fs.readFileSync(publicAssetPath, 'utf8');
  if (surfaceCss.includes('../fonts/')) {
    throw new Error(`Unresolved relative public font reference remains in ${publicAssetPath}`);
  }
}

const staleSurfaceCss = Object.keys(publicSurfaceCssPaths)
  .filter(sourceName => new RegExp(`${sourceName}\\.[A-Za-z0-9_-]+\\.css`).test(precomputedManifest));
if (staleSurfaceCss.length > 0) {
  throw new Error(`Stale public surface stylesheet references remain: ${staleSurfaceCss.join(', ')}`);
}
fs.writeFileSync(precomputedManifestPath, precomputedManifest);
console.log(`Patched successfully: ${precomputedManifestPath}`);

// Nuxt's precomputed dependency maps contain inline asset declarations for
// dynamic layouts, so removing flags from those declarations cannot suppress
// their resource-hint links. The explicit SSR stylesheet links above are the
// canonical loads; skip only these stable surface files when rendering preload or
// prefetch hints.
const rendererPath = '.output/server/chunks/routes/renderer.mjs';
if (!fs.existsSync(rendererPath)) {
  throw new Error(`Unable to find Nuxt renderer: ${rendererPath}`);
}
let renderer = fs.readFileSync(rendererPath, 'utf8');
const surfaceHintGuard = `if(${Object.values(publicSurfaceCssPaths)
  .map(targetPath => `o.file===${JSON.stringify(targetPath)}`)
  .join('||')})continue;`;
const hintFunctions = [
  'function getPreloadLinks(e,t){const{preload:r}=getRequestDependencies(e,t),s=[];for(const e in r){const o=r[e];',
  'function getPrefetchLinks(e,t){const{prefetch:r}=getRequestDependencies(e,t),s=[];for(const e in r){const o=r[e];',
];
for (const marker of hintFunctions) {
  if (!renderer.includes(marker)) {
    throw new Error(`Unable to locate generated resource-hint renderer: ${marker.slice(0, 32)}`);
  }
  renderer = renderer.replace(marker, `${marker}${surfaceHintGuard}`);
}
fs.writeFileSync(rendererPath, renderer);
console.log(`Patched successfully: ${rendererPath}`);
