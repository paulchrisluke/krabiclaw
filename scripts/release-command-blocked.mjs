#!/usr/bin/env node

const environment = process.argv[2] === 'staging' ? 'staging' : 'production'
const workflow = environment === 'staging'
  ? 'CI (Full Validation Lane)'
  : 'Production release (manifest-gated)'

console.error(`Direct ${environment} deployment is disabled.`)
console.error(`Use the GitHub Actions workflow "${workflow}" so the release is tied to one source SHA, build artifact, Worker Version, migration snapshot, and browser evidence.`)
if (environment === 'production') {
  console.error('Production also requires the successful staging candidate manifest and protected-environment approval.')
}
process.exit(1)
