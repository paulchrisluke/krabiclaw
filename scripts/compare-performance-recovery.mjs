import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  comparePerformanceReports,
  renderPerformanceComparisonMarkdown,
} from './lib/performance-comparison.mjs'

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) values[key] = 'true'
    else {
      values[key] = next
      index += 1
    }
  }
  return values
}

async function readReport(filePath, label) {
  if (!filePath) throw new Error(`Missing --${label} report path`)
  try {
    return JSON.parse(await readFile(path.resolve(filePath), 'utf8'))
  } catch (error) {
    throw new Error(`Unable to read ${label} report ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const args = parseArgs(process.argv.slice(2))
try {
  const baseline = await readReport(args.baseline, 'baseline')
  const head = await readReport(args.head, 'head')
  const comparison = comparePerformanceReports(baseline, head)
  const outputDir = path.resolve(args['output-dir'] ?? 'test-results/performance-recovery')
  await mkdir(outputDir, { recursive: true })
  const jsonPath = path.join(outputDir, 'performance-comparison.json')
  const markdownPath = path.join(outputDir, 'performance-comparison.md')
  await writeFile(jsonPath, `${JSON.stringify(comparison, null, 2)}\n`)
  await writeFile(markdownPath, renderPerformanceComparisonMarkdown(comparison))
  process.stdout.write(`[benchmark] ${jsonPath}\n[benchmark] ${markdownPath}\n`)
  if (!comparison.ok) {
    process.stderr.write(comparison.failures.map(failure => `❌ ${failure}`).join('\n') + '\n')
    process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`❌ ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
