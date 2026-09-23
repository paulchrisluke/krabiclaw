#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { credentialSession } from './utils/e2e-auth.mjs'

const { values: args } = parseArgs({ options: {
  'base-url': { type: 'string', default: 'http://localhost:3000' },
  'organization-id': { type: 'string' },
  platform: { type: 'boolean', default: false },
  email: { type: 'string', default: 'developer@playwright.example' },
  password: { type: 'string' },
} })
const baseURL = args['base-url']
const password = args.password || process.env.E2E_TEST_PASSWORD
if (!password) throw new Error('E2E_TEST_PASSWORD or --password is required. Use the credential provisioned by local:setup.')
const { cookie } = await credentialSession(baseURL, { email: args.email, password })
const headers = { cookie, origin: new URL(baseURL).origin, 'content-type': 'application/json' }
const endpointFor = id => `/api/editor/organizations/${encodeURIComponent(id)}/social-cards/regenerate`
const tenants = []
if (args.platform) tenants.push({ id: 'platform', endpoint: endpointFor('platform') })
if (args['organization-id']) tenants.push({ id: args['organization-id'], endpoint: endpointFor(args['organization-id']) })
if (!args.platform && !args['organization-id']) {
  const list = await fetch(new URL('/api/auth/organization/list', baseURL), { headers })
  if (!list.ok) throw new Error(`Could not list organizations: ${list.status}`)
  const organizations = await list.json()
  if (!Array.isArray(organizations) || !organizations.length) throw new Error('The account belongs to no organizations.')
  for (const organization of organizations) {
    const context = await fetch(new URL(`/api/dashboard/context?org=${encodeURIComponent(organization.slug)}`, baseURL), { headers })
    if (!context.ok) throw new Error(`${organization.slug}: context ${context.status}`)
    const payload = await context.json()
    if (!payload.organization?.id) throw new Error(`${organization.slug}: invalid dashboard context`)
    tenants.push({ id: payload.organization.id, endpoint: endpointFor(payload.organization.id) })
  }
}
if (!tenants.length) throw new Error('No organizations are available for social-card generation.')
let generated = 0
let reused = 0
let skipped = 0
let failed = 0
for (const site of tenants) {
  let after = null
  try {
    do {
      const response = await fetch(new URL(site.endpoint, baseURL), { method: 'POST', headers, body: JSON.stringify({ after }) })
      if (!response.ok) throw new Error(`Regeneration returned ${response.status}: ${await response.text()}`)
      const page = await response.json()
      if (!Array.isArray(page.results) || !(page.next_cursor === null || typeof page.next_cursor === 'string')) throw new Error('Invalid regeneration response')
      for (const result of page.results) {
        if (result.kind === 'generated' || result.kind === 'reused') {
          const image = await fetch(result.publicUrl)
          if (!image.ok) throw new Error(`${result.owner.owner_type}/${result.owner.owner_id}: PNG fetch ${image.status}`)
          const bytes = Buffer.from(await image.arrayBuffer())
          if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 1200 || bytes.readUInt32BE(20) !== 630) throw new Error(`${result.publicUrl}: expected a 1200x630 PNG`)
          if (result.kind === 'generated') generated++
          else reused++
          console.log(`[local:cards] ${site.id} ${result.owner.owner_type}/${result.owner.owner_id}: ${result.kind} ${result.publicUrl}`)
        } else if (result.kind === 'skipped') {
          skipped++
          console.warn(`[local:cards] ${site.id} ${result.owner.owner_type}/${result.owner.owner_id}: skipped (${result.reason})`)
        } else if (result.kind === 'failed') {
          failed++
          console.error(`[local:cards] ${site.id} ${result.owner.owner_type}/${result.owner.owner_id}: failed (${result.error})`)
        } else throw new Error('Unknown social-card outcome')
      }
      if (page.next_cursor && page.next_cursor === after) throw new Error('Regeneration cursor did not advance')
      after = page.next_cursor
    } while (after)
  } catch (error) {
    failed++
    console.error(`[local:cards] ${site.id}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
console.log(`[local:cards] ${generated} generated, ${reused} reused, ${skipped} skipped, ${failed} failed.`)
process.exitCode = failed ? 1 : 0
