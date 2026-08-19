import { appendFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { matchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CORE_ONLY_PATTERNS,
  HIGH_IMPACT_PATTERNS,
  IMPACT_GROUPS,
  NON_RUNTIME_PATTERNS
} from '../config/e2e-impact-map.mjs'

const STAGING_ONLY_SPECS = new Set(['tests/e2e/staging-review-auth.spec.ts'])

const normalize = value => value.replaceAll('\\', '/').replace(/^\.\//, '')
const matchesAny = (file, patterns) => patterns.some(pattern => matchesGlob(file, pattern))

export function listE2eSpecs() {
  const directory = fileURLToPath(new URL('../tests/e2e/', import.meta.url))
  return readdirSync(directory)
    .filter(file => file.endsWith('.spec.ts'))
    .filter(file => !STAGING_ONLY_SPECS.has(`tests/e2e/${file}`))
    .map(file => `tests/e2e/${file}`)
    .sort()
}

export function selectPreviewE2e(changedFiles, allSpecs = listE2eSpecs()) {
  const files = [...new Set(changedFiles.map(normalize).filter(Boolean))].sort()
  const runtimeFiles = files.filter(file => !matchesAny(file, NON_RUNTIME_PATTERNS) && !STAGING_ONLY_SPECS.has(file))

  if (runtimeFiles.length === 0) {
    return {
      runPreview: false,
      scope: 'none',
      groups: [],
      specs: [],
      changedFiles: files,
      unclassifiedFiles: []
    }
  }

  const highImpactFiles = runtimeFiles.filter(file => matchesAny(file, HIGH_IMPACT_PATTERNS))
  if (highImpactFiles.length > 0) {
    return {
      runPreview: true,
      scope: 'full',
      groups: ['full-runtime'],
      specs: [...allSpecs].sort(),
      changedFiles: files,
      unclassifiedFiles: []
    }
  }

  const selectedGroups = IMPACT_GROUPS.filter(group =>
    runtimeFiles.some(file => matchesAny(file, group.patterns)))
  const directlyChangedSpecs = runtimeFiles.filter(file => allSpecs.includes(file))
  const classifiedFiles = new Set(runtimeFiles.filter(file =>
    matchesAny(file, CORE_ONLY_PATTERNS)
    || allSpecs.includes(file)
    || selectedGroups.some(group => matchesAny(file, group.patterns))))
  const unclassifiedFiles = runtimeFiles.filter(file => !classifiedFiles.has(file))

  if (unclassifiedFiles.length > 0) {
    return {
      runPreview: true,
      scope: 'full',
      groups: ['unclassified-runtime'],
      specs: [...allSpecs].sort(),
      changedFiles: files,
      unclassifiedFiles
    }
  }

  const specs = [...new Set([
    ...directlyChangedSpecs,
    ...selectedGroups.flatMap(group => group.specs)
  ])].sort()

  return {
    runPreview: true,
    scope: specs.length > 0 ? 'affected' : 'core',
    groups: selectedGroups.map(group => group.id),
    specs,
    changedFiles: files,
    unclassifiedFiles: []
  }
}

export function changedFilesBetween(base, head, cwd) {
  if (!base || !head) throw new Error('Both base and head commits are required')
  const isEmptyBase = /^0+$/.test(base)
  const args = isEmptyBase
    ? ['diff-tree', '--no-commit-id', '--name-only', '-r', head]
    : ['diff', '--name-only', '--diff-filter=ACDMR', `${base}...${head}`]
  const output = execFileSync('git', args, { cwd, encoding: 'utf8' })
  return output.split('\n').filter(Boolean)
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function writeGithubOutputs(path, plan) {
  appendFileSync(path, [
    `run_preview=${plan.runPreview}`,
    `scope=${plan.scope}`,
    `groups=${plan.groups.join(',')}`,
    `specs=${plan.specs.join(',')}`,
    ''
  ].join('\n'))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const base = argument('--base') || process.env.E2E_BASE_SHA
  const head = argument('--head') || process.env.E2E_HEAD_SHA
  const output = argument('--github-output') || process.env.GITHUB_OUTPUT
  const plan = selectPreviewE2e(changedFilesBetween(base, head))

  console.log(`Preview E2E scope: ${plan.scope}`)
  console.log(`Changed files: ${plan.changedFiles.length}`)
  console.log(`Impact groups: ${plan.groups.join(', ') || 'none'}`)
  console.log(`Selected specs: ${plan.specs.join(', ') || 'core only'}`)
  if (plan.unclassifiedFiles.length > 0) {
    console.log(`Unclassified runtime files promoted to full coverage: ${plan.unclassifiedFiles.join(', ')}`)
  }
  if (output) writeGithubOutputs(output, plan)
}
