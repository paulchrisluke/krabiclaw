#!/usr/bin/env node
// Every message in the catalog renders a complete email.
//
// The catalog is what /dev/notifications shows and what the send path uses, so
// a broken entry is a broken email. A missing or mistyped value is a Vue
// warning rather than an exception — a preview once rendered "How was
// undefined?" and still passed — so warnings are failures here.
//
// It also holds the line that made the redesign possible: no colour is written
// outside server/emails/tokens.ts. Twenty-two of twenty-three templates used to
// carry their own, which is how zinc greys ended up inside a navy shell.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderNotificationEmail } from '~/server/emails/render'
import { NOTIFICATION_CATALOG } from '~/server/notifications/catalog'

const failures: string[] = []

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

for (const file of walk('server/emails')) {
  if (!file.endsWith('.ts') || file.endsWith('tokens.ts')) continue
  const source = readFileSync(file, 'utf8')
  for (const [hex] of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    failures.push(`${file} writes the colour ${hex}; take it from server/emails/tokens.ts`)
  }
}

const warnings: string[] = []
const originalWarn = console.warn
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }

for (const entry of NOTIFICATION_CATALOG) {
  warnings.length = 0
  try {
    const { html, text } = await renderNotificationEmail(entry.message, {
      platformDomain: 'krabiclaw.com',
      preferencesUrl: 'https://krabiclaw.com/dashboard/account/profile/notifications',
      unsubscribeUrl: 'https://krabiclaw.com/unsubscribe?x=preview',
    })
    if (!html.includes('krabi-claw-logo.png')) failures.push(`${entry.id} did not render through EmailFrame`)
    if (!text.trim()) failures.push(`${entry.id} rendered an empty plain-text body`)
    // Against the plain-text render: the HTML escapes apostrophes and
    // ampersands, so comparing a raw title to it reports false failures.
    if (!text.toLowerCase().includes(entry.message.title.toLowerCase())) {
      failures.push(`${entry.id} does not show its own title`)
    }
  } catch (error) {
    failures.push(`${entry.id} failed to render: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  }
  for (const warning of warnings.filter(entry => entry.includes('[Vue warn]'))) {
    failures.push(`${entry.id}: ${warning.split('\n')[0]}`)
  }
}

console.warn = originalWarn

if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Email catalog passed: ${NOTIFICATION_CATALOG.length} messages rendered, no colour written outside tokens`)
