const fs = require('fs');

const publicSurfaceCssPaths = {
  'platform-entry': 'surfaces/platform.css',
  'saya': 'surfaces/saya.css',
  'blawby': 'surfaces/blawby.css',
};
const precomputedManifestCandidates = [
  '.output/server/_chunks/precomputed.mjs',
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
  fs.writeFileSync(publicAssetPath, surfaceCss.replace(/url\((?:\.\.\/)+fonts\//g, 'url(/fonts/'));

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
const rendererPath = '.output/server/_libs/@nuxt/nitro-server.mjs';
if (!fs.existsSync(rendererPath)) {
  throw new Error(`Unable to find Nuxt renderer: ${rendererPath}`);
}
let renderer = fs.readFileSync(rendererPath, 'utf8');
const hintFunctions = [
  'function getPreloadLinks(ssrContext, rendererContext, options) {\n\tconst { preload } = getRequestDependencies(ssrContext, rendererContext, options);\n\tconst result = [];\n\tfor (const key in preload) {\n\t\tconst resource = preload[key];',
  'function getPrefetchLinks(ssrContext, rendererContext, options) {\n\tconst { prefetch } = getRequestDependencies(ssrContext, rendererContext, options);\n\tconst result = [];\n\tfor (const key in prefetch) {\n\t\tconst resource = prefetch[key];',
];
for (const marker of hintFunctions) {
  if (!renderer.includes(marker)) {
    throw new Error(`Unable to locate generated resource-hint renderer: ${marker.slice(0, 32)}`);
  }
  renderer = renderer.replace(marker, `${marker}\n\t\tif (${Object.values(publicSurfaceCssPaths).map(targetPath => `resource.file === ${JSON.stringify(targetPath)}`).join(' || ')}) continue;`);
}
fs.writeFileSync(rendererPath, renderer);
console.log(`Patched successfully: ${rendererPath}`);
