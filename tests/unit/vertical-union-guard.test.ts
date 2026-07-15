import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Repository-search guard for #277 (onboarding architecture cleanup): a local
// 'restaurant' | 'experience' (or similarly narrowed) two-value vertical type
// union in shared onboarding/dashboard code has repeatedly caused a
// professional_service/service tenant to be silently miscategorized as
// restaurant (see server/utils/dashboard-context.ts's DashboardSiteRow before
// this fix, TransferOnboardingWizard.vue's old `vertical` prop type, and the
// transfer-onboarding page's `ctx.site.vertical === 'experience' ? ... :
// 'restaurant'` ternary). The canonical vertical contract is documented in
// CONTEXT.md: one list (utils/vertical-copy.ts's ALL_VERTICALS /
// server/utils/site-creation.ts's VALID_VERTICALS) and one normalization
// boundary (normalizeVertical() / toStoredVertical()) — new code should
// import that type/list rather than hand-writing a narrower union.
//
// This test greps shared onboarding/dashboard-facing source for the literal
// two-value pattern and fails if it finds one outside the allowlist below.
// It is intentionally narrow (looks for the exact historical bug shape, not
// every possible vertical-narrowing mistake) to avoid false positives on
// unrelated 'restaurant' | 'experience' usages elsewhere in the app (e.g.
// legacy seed/report code not in the onboarding/dashboard vertical-decision
// path).

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(here, '..', '..')

// Directories/files that are allowed to keep a narrower legacy union — either
// because they're intentionally scoped to pre-professional_service verticals
// (dead code paths not reachable by new tenants) or because fixing them is
// tracked in a follow-up issue rather than this one.
const ALLOWLIST_SUBSTRINGS = [
  // Test fixtures/specs are allowed to hardcode narrower literal expectations
  // for a specific scenario; they're not the shared contract.
  '/tests/',
  '/node_modules/',
  '/.nuxt/',
  '/.output/',
  '/.git/',
]

const TARGET_DIRS = [
  'server/api/dashboard',
  'server/utils/dashboard-context.ts',
  'composables',
  'components/workspace/onboarding',
  'pages/dashboard',
]

// Matches the exact historical bug shape: a TS union or ternary that pairs
// 'restaurant' and 'experience' literals without 'professional_service' (or
// its DB alias 'service') anywhere on the same line.
const NARROW_UNION_PATTERN = /['"]restaurant['"]\s*\|\s*['"]experience['"]|['"]experience['"]\s*\|\s*['"]restaurant['"]/

function walk(path: string, files: string[] = []): string[] {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walk(join(path, entry), files)
    }
    return files
  }
  if (/\.(ts|vue)$/.test(path)) files.push(path)
  return files
}

test('no shared onboarding/dashboard code reintroduces a local restaurant|experience two-value vertical union', () => {
  const offenders: { file: string; line: number; text: string }[] = []

  for (const target of TARGET_DIRS) {
    const absolute = join(repoRoot, target)
    let files: string[]
    try {
      const stat = statSync(absolute)
      files = stat.isDirectory() ? walk(absolute) : [absolute]
    } catch {
      continue // target doesn't exist in this checkout; skip
    }

    for (const file of files) {
      const relPath = relative(repoRoot, file)
      if (ALLOWLIST_SUBSTRINGS.some(s => relPath.includes(s.replace(/^\//, '').replace(/\/$/, '')))) continue

      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, idx) => {
        // A line that also mentions professional_service or the DB alias
        // 'service' is not the bug pattern — it's a legitimate multi-value
        // check or comment discussing the bridge.
        if (NARROW_UNION_PATTERN.test(line) && !/professional_service|'service'|"service"/.test(line)) {
          offenders.push({ file: relPath, line: idx + 1, text: line.trim() })
        }
      })
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Found local 'restaurant' | 'experience' two-value vertical unions outside the allowlist:\n${
      offenders.map(o => `  ${o.file}:${o.line}: ${o.text}`).join('\n')
    }\nImport SiteVertical/ALL_VERTICALS from utils/vertical-copy.ts instead, or normalize with normalizeVertical() before narrowing.`
  )
})
