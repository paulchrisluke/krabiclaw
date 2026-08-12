#!/usr/bin/env node

console.error('Direct production rollback is disabled.')
console.error('Use Cloudflare deployment history to restore the last known-good production deployment, then repair through staging and main.')
process.exit(1)
