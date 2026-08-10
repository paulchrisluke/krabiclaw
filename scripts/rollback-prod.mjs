#!/usr/bin/env node

console.error('Direct production rollback is disabled.')
console.error('Use the Production rollback (exact-target, manifest-gated) workflow with the declared current/target Worker IDs, target source SHA, incident reason, and protected production Environment.')
process.exit(1)
