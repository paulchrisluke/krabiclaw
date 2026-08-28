#!/usr/bin/env node
// Fails CI if active source reintroduces the request-time OG rendering pipeline this repo
// deleted for issue #685 — a gradient/color-block fallback, public metadata pointing at the
// deleted /og-image-render.png route, or the deleted renderer/pipeline files. Kept narrow: it
// must not flag ordinary gradients used elsewhere in the UI, only the specific OG-card pattern.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ROOTS = ['components', 'composables', 'layouts', 'pages', 'server', 'shared', 'utils']
const EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.vue'])
const ALLOWED_FILES = new Set([
  'scripts/check-og-image-guard.mjs',
  'docs/seo-indexing-architecture.md',
])

export const OG_IMAGE_DRIFT_PATTERNS = [
  // The deleted request-time render route must never reappear in emitted metadata or code.
  /og-image-render\.png/,
  // The deleted request-time pipeline/render orchestration files.
  /from\s+['"][^'"]*server\/utils\/og-image\/pipeline['"]/,
  /resolveOgImage\s*\(/,
  // A gradient/color-block substituted as an OG card background — the specific pattern that
  // was in server/utils/og-image/renderers/shared.ts before issue #685, not gradients in
  // general UI styling.
  /backgroundImage:\s*`linear-gradient\([^`]*\$\{(?:primary|secondary)\}/,
  // The deleted request-time query-string builder/parser for the old render route.
  /\bbuildOgImageUrl\s*\(/,
  /\bcomputeOgImageCacheKey\s*\(/,
  /\bparseOgImageQuery\s*\(/,
  // heroImage/primaryColor/secondaryColor as inputs to useSocialMetadata — removed everywhere
  // in favor of ownerType/ownerId + a resolved socialImage; reintroducing them signals a
  // regression back toward the old contract. Non-greedy across the whole call (not just up to
  // the first `)`, which the near-universal `useSocialMetadata(() => ({...}))` arrow-callback
  // shape hits almost immediately) — bounded so it can't runaway-match across unrelated code.
  /useSocialMetadata\([\s\S]{0,600}?heroImage\s*:/,
]

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.wrangler', '.git', '.nuxt'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (EXTENSIONS.has(extname(path))) files.push(path)
  }
  return files
}

export function findOgImageDriftViolations(relativePath, source) {
  const normalized = relativePath.replaceAll('\\', '/')
  if (ALLOWED_FILES.has(normalized)) return []
  return OG_IMAGE_DRIFT_PATTERNS
    .filter(pattern => pattern.test(source))
    .map(pattern => `${normalized}: ${pattern}`)
}

export function collectOgImageDriftViolations(root = ROOT) {
  const violations = []
  for (const rootName of ROOTS) {
    const directory = join(root, rootName)
    if (!existsSync(directory)) continue
    for (const file of walk(directory)) {
      violations.push(...findOgImageDriftViolations(relative(root, file), readFileSync(file, 'utf8')))
    }
  }
  return violations
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = collectOgImageDriftViolations()
  if (violations.length) {
    console.error(`OG image drift guard failed (${violations.length} violation${violations.length === 1 ? '' : 's'}):`)
    for (const violation of violations) console.error(`- ${violation}`)
    console.error('\nissue #685 requires every og:image to be a real, persisted, publish-time-generated asset — no request-time rendering route, no gradient/color-block fallback.')
    process.exit(1)
  }
  console.log('OG image drift guard passed.')
}
