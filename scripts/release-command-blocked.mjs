#!/usr/bin/env node

const environment = process.argv[2] === 'staging' ? 'staging' : 'production'
const operation = process.argv[3] || 'deployment'
const workflow = operation === 'zaraz-ga4-backfill'
    ? 'Zaraz GA4 Backfill Plan'
    : 'CI'

if (operation === 'zaraz-ga4-backfill') {
  console.error('Direct Zaraz GA4 backfill apply is disabled.')
  console.error(`Use the GitHub Actions workflow "${workflow}"; it is plan-only and never writes zone-level Zaraz configuration.`)
} else {
  console.error(`Direct ${environment} ${operation} is disabled.`)
  console.error(`Use the normal pull request flow; the "${workflow}" workflow deploys staging and production from their branches and runs browser coverage.`)
}
process.exit(1)
