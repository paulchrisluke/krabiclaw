#!/usr/bin/env node
// Every email template appears in /dev/notifications, and every preview renders.
//
// The preview is the only place anyone can see what the product's mail looks
// like. A hand-maintained list drifted to covering 14 of 23 templates without
// anyone noticing, and a preview whose props are wrong renders a page saying
// "How was undefined?" while Vue only warns — so this checks both coverage and
// that each entry actually produces a complete email.

import { readdirSync, readFileSync } from 'node:fs'
import { renderEmail } from '~/server/emails/vue-email'
import { EMAIL_PREVIEWS } from '~/server/emails/previews'

const TEMPLATE_DIR = 'server/emails/templates'
const REGISTRY = 'server/emails/previews.ts'

const templates = readdirSync(TEMPLATE_DIR)
  .filter(name => name.endsWith('.ts'))
  .map(name => name.replace(/\.ts$/, ''))
  .sort()

const registry = readFileSync(REGISTRY, 'utf8')
const imported = new Set(
  [...registry.matchAll(/^import\s+\w+\s+from\s+'\.\/templates\/(\w+)'$/gm)].map(match => match[1]!),
)

const failures: string[] = []

for (const name of templates) {
  if (!imported.has(name)) failures.push(`${name} has no EMAIL_PREVIEWS entry in ${REGISTRY}`)
}
for (const name of imported) {
  if (!templates.includes(name)) failures.push(`${REGISTRY} imports ${name}, which is no longer a template`)
}

// A missing or mistyped prop is a Vue warning, not an exception, so warnings
// are failures here — otherwise a preview renders "undefined" and still passes.
const warnings: string[] = []
const originalWarn = console.warn
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }

for (const preview of EMAIL_PREVIEWS) {
  warnings.length = 0
  try {
    const { html, text } = await renderEmail(preview.component, preview.props)
    if (!html.includes('krabi-claw-logo.png')) failures.push(`${preview.id} did not render through EmailShell`)
    if (!text.trim()) failures.push(`${preview.id} rendered an empty plain-text body`)
  } catch (error) {
    failures.push(`${preview.id} failed to render: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  }
  for (const warning of warnings.filter(entry => entry.includes('[Vue warn]'))) {
    failures.push(`${preview.id}: ${warning.split('\n')[0]}`)
  }
}

console.warn = originalWarn

if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Email preview coverage passed: ${templates.length} templates, ${EMAIL_PREVIEWS.length} previews rendered`)
