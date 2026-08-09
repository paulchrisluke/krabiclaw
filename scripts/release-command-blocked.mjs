#!/usr/bin/env node

const environment = process.argv[2] === 'staging' ? 'staging' : 'production'
const operation = process.argv[3] || 'deployment'
const workflow = operation === 'rollback'
  ? 'Production rollback (exact-target, manifest-gated)'
  : operation === 'zaraz-ga4-backfill'
    ? 'Zaraz GA4 Backfill Plan'
    : environment === 'staging'
  ? 'CI (Full Validation Lane)'
  : 'Production release (manifest-gated)'

if (operation === 'zaraz-ga4-backfill') {
  console.error('Direct Zaraz GA4 backfill apply is disabled.')
  console.error(`Use the GitHub Actions workflow "${workflow}"; it is plan-only and never writes zone-level Zaraz configuration.`)
} else {
  console.error(`Direct ${environment} ${operation} is disabled.`)
  console.error(`Use the GitHub Actions workflow "${workflow}" so the release is tied to one source SHA, build artifact, Worker Version, migration snapshot, and browser evidence.`)
}
if (environment === 'production' && operation !== 'zaraz-ga4-backfill' && operation !== 'rollback') {
  console.error('Production also requires the successful staging candidate manifest and protected-environment approval.')
}
process.exit(1)
