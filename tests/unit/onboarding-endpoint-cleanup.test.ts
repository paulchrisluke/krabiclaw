import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Regression coverage for #277 (onboarding architecture cleanup):
// - server/api/dashboard/onboarding/setup.post.ts (direct site-creation
//   branch, unreachable dead code once new-site creation moved to the draft
//   flow) and setup-manual.post.ts (unused once add-location settled on
//   /api/dashboard/locations/add for both its Places and manual paths) are
//   removed entirely, not left as adapters — see #277's acceptance criteria.
// - server/api/dashboard/onboarding/places-preview.post.ts replaces the
//   previewOnly branch that used to live inline in setup.post.ts as the new
//   new-site wizard's single-purpose Places lookup endpoint.
const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(here, '..', '..')

test('setup.post.ts and setup-manual.post.ts no longer exist', () => {
  assert.equal(existsSync(join(repoRoot, 'server/api/dashboard/onboarding/setup.post.ts')), false)
  assert.equal(existsSync(join(repoRoot, 'server/api/dashboard/onboarding/setup-manual.post.ts')), false)
})

test('the dedicated places-preview endpoint exists and is a read-only lookup', () => {
  const source = readFileSync(join(repoRoot, 'server/api/dashboard/onboarding/places-preview.post.ts'), 'utf8')
  assert.ok(/getPlaceDetails|getPlaceDetailsByUrl/.test(source), 'expected a Google Places lookup call')
  assert.ok(!/runSiteCreation|INSERT INTO sites/.test(source), 'preview endpoint must never create a site')
  assert.ok(!/chargeFlatCredits/.test(source), 'preview endpoint must never charge ai_credits directly')
})

function walk(path: string, files: string[] = []): string[] {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) walk(join(path, entry), files)
    return files
  }
  if (/\.(ts|vue)$/.test(path)) files.push(path)
  return files
}

test('no remaining reference to the removed onboarding/setup(-manual) endpoints or wizard props outside this test file', () => {
  const stalePatterns = [
    /onboarding\/setup-manual/,
    /onboarding\/setup['"`\s)]/, // the bare setup endpoint, not setup-manual or places-preview
    /\bsetupEndpoint\b/,
    /\bsetupManualEndpoint\b/,
    /setup-endpoint=/,
    /setup-manual-endpoint=/,
    /\bskipVertical\?:\s*boolean/, // the old OnboardingWizard prop declaration shape
    /\bisAddingLocation\?:\s*boolean/, // the old OnboardingWizard prop declaration shape
  ]

  const searchDirs = ['server/api', 'components', 'pages', 'composables']
  const offenders: string[] = []

  for (const dir of searchDirs) {
    const absolute = join(repoRoot, dir)
    if (!existsSync(absolute)) continue
    for (const file of walk(absolute)) {
      const relPath = relative(repoRoot, file)
      const contents = readFileSync(file, 'utf8')
      for (const pattern of stalePatterns) {
        if (pattern.test(contents)) offenders.push(`${relPath}: matches ${pattern}`)
      }
    }
  }

  assert.deepEqual(offenders, [], `Found stale references to removed onboarding endpoints/props:\n${offenders.join('\n')}`)
})
