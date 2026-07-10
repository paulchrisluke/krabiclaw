#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BLAWBY_PARITY_COLOR_THRESHOLD,
  BLAWBY_PARITY_MAX_DIFF_RATIO,
  BLAWBY_REFERENCE_COMMIT,
} from './blawby-parity-config.mjs'
import { comparePngFiles } from './utils/blawby-image-diff.mjs'

function parseArgs(argv) {
  const args = {
    referenceManifest: '',
    actualManifest: '',
    outDir: 'client-imports/north-carolina-legal-services/evidence/parity-diff',
    maxDiffRatio: BLAWBY_PARITY_MAX_DIFF_RATIO,
    colorThreshold: BLAWBY_PARITY_COLOR_THRESHOLD,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--reference-manifest') args.referenceManifest = argv[++i]
    else if (arg === '--actual-manifest') args.actualManifest = argv[++i]
    else if (arg === '--out-dir') args.outDir = argv[++i]
    else if (arg === '--max-diff-ratio') args.maxDiffRatio = Number(argv[++i])
    else if (arg === '--color-threshold') args.colorThreshold = Number(argv[++i])
  }
  if (!args.referenceManifest || !args.actualManifest) {
    throw new Error('--reference-manifest and --actual-manifest are required')
  }
  if (!(args.maxDiffRatio >= 0 && args.maxDiffRatio <= 1)) throw new Error('--max-diff-ratio must be between 0 and 1')
  if (!(args.colorThreshold >= 0 && args.colorThreshold <= 255)) throw new Error('--color-threshold must be between 0 and 255')
  return args
}

function sectionKey(section) {
  return `${section.route_name}|${section.viewport}|${section.slot}`
}

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, '-')
}

const args = parseArgs(process.argv.slice(2))
const referenceManifestPath = path.resolve(args.referenceManifest)
const actualManifestPath = path.resolve(args.actualManifest)
const [referenceManifest, actualManifest] = await Promise.all([
  fs.readFile(referenceManifestPath, 'utf8').then(JSON.parse),
  fs.readFile(actualManifestPath, 'utf8').then(JSON.parse),
])

if (referenceManifest.source !== 'reference') throw new Error('Reference manifest must have source=reference')
if (actualManifest.source !== 'blawby') throw new Error('Actual manifest must have source=blawby')
if (referenceManifest.source_revision !== BLAWBY_REFERENCE_COMMIT) {
  throw new Error(`Reference manifest is not pinned to ${BLAWBY_REFERENCE_COMMIT}`)
}
if (referenceManifest.browser?.version !== actualManifest.browser?.version) {
  throw new Error('Reference and actual captures must use the same Chromium version')
}

const referenceRoot = path.dirname(referenceManifestPath)
const actualRoot = path.dirname(actualManifestPath)
const referenceSections = new Map((referenceManifest.sections || []).map(section => [sectionKey(section), section]))
const actualSections = new Map((actualManifest.sections || []).map(section => [sectionKey(section), section]))
if (!referenceSections.size || !actualSections.size) throw new Error('Both manifests must contain section captures')

const keys = [...new Set([...referenceSections.keys(), ...actualSections.keys()])].sort()
const comparisons = []
for (const key of keys) {
  const reference = referenceSections.get(key)
  const actual = actualSections.get(key)
  if (!reference || !actual) {
    comparisons.push({ key, ok: false, reason: reference ? 'missing_actual_section' : 'missing_reference_section' })
    continue
  }
  const diffPath = path.resolve(args.outDir, `${safeName(key)}.png`)
  const result = await comparePngFiles({
    referencePath: path.resolve(referenceRoot, reference.file),
    actualPath: path.resolve(actualRoot, actual.file),
    diffPath,
    colorThreshold: args.colorThreshold,
    maxDiffRatio: args.maxDiffRatio,
  })
  comparisons.push({
    key,
    route_name: reference.route_name,
    viewport: reference.viewport,
    slot: reference.slot,
    reference_name: reference.name,
    actual_name: actual.name,
    diff_file: path.relative(path.resolve(args.outDir), diffPath).replaceAll('\\', '/'),
    ...result,
  })
}

const report = {
  schema_version: 1,
  checked_at: new Date().toISOString(),
  ok: comparisons.every(comparison => comparison.ok),
  reference_revision: referenceManifest.source_revision,
  actual_revision: actualManifest.source_revision,
  chromium_version: referenceManifest.browser.version,
  thresholds: {
    max_diff_ratio: args.maxDiffRatio,
    color_threshold: args.colorThreshold,
  },
  comparisons,
}
await fs.mkdir(path.resolve(args.outDir), { recursive: true })
await fs.writeFile(path.resolve(args.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(
  path.resolve(args.outDir, 'report.md'),
  `${[
    '# Blawby Visual Parity',
    '',
    `- Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `- Reference: \`${report.reference_revision}\``,
    `- Actual: \`${report.actual_revision}\``,
    `- Chromium: \`${report.chromium_version}\``,
    `- Maximum differing pixels: ${args.maxDiffRatio * 100}%`,
    `- Color threshold: ${args.colorThreshold}`,
    '',
    '## Sections',
    '',
    ...comparisons.map(comparison => `- ${comparison.ok ? 'PASS' : 'FAIL'}: ${comparison.key}${typeof comparison.diff_ratio === 'number' ? ` (${(comparison.diff_ratio * 100).toFixed(4)}%)` : ` (${comparison.reason})`}`),
  ].join('\n')}\n`,
)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.ok) process.exitCode = 1
