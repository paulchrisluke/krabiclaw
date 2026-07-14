#!/usr/bin/env node
// One-time-per-environment setup step for the OG image render pipeline
// (server/utils/og-image/wasm-loader.ts): uploads the resvg-wasm binary to the existing
// krabiclaw-media R2 bucket (MEDIA_BUCKET binding) so the Worker can fetch it at runtime
// instead of bundling ~2.4MB of wasm into the script itself.
//
// Until this has been run for an environment, the dynamic OG image route
// (/og-image-render.png) gracefully falls back to the static shared image — pages still
// get a valid og:image, just not a per-page generated card. Safe to re-run; it's an
// idempotent object PUT.
//
// Usage:
//   node scripts/upload-og-renderer-assets.mjs --env preview
//   node scripts/upload-og-renderer-assets.mjs --env staging
//   node scripts/upload-og-renderer-assets.mjs --env production   (or omit --env)

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const wasmPath = path.join(repoRoot, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')
const r2Key = '_internal/og-renderer/resvg.wasm'
const bucketName = 'krabiclaw-media'

const envArgIndex = process.argv.indexOf('--env')
const env = envArgIndex !== -1 ? process.argv[envArgIndex + 1] : null

const args = [
  'wrangler', 'r2', 'object', 'put',
  `${bucketName}/${r2Key}`,
  '--file', wasmPath,
  '--content-type', 'application/wasm',
  '--remote',
]
if (env && env !== 'production') args.push('--env', env)

console.log(`Uploading ${wasmPath} -> r2://${bucketName}/${r2Key}${env ? ` (env: ${env})` : ' (production)'}`)
execFileSync('npx', args, { stdio: 'inherit', cwd: repoRoot })
console.log('Done.')
