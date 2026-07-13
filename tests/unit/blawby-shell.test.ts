import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('Blawby shell query selects minimal offering links and excludes route bodies', () => {
  const source = readFileSync('server/utils/professional-services.ts', 'utf8')
  const shellLoader = source.slice(
    source.indexOf('export async function getPublicBlawbyShellData'),
    source.indexOf('export async function getPublicBlawbyData'),
  )
  const offeringLinksLoader = source.slice(
    source.indexOf('export async function listPublicOfferingLinks'),
    source.indexOf('export async function getPublicOfferingBySlug'),
  )

  assert.match(shellLoader, /getPublicBlawbyIdentity/)
  assert.match(shellLoader, /listPublicNavigationItems/)
  assert.match(shellLoader, /getPublicConsultationSettings/)
  assert.match(shellLoader, /getPublicCompliance/)
  assert.match(shellLoader, /getPublicThemeTokens/)
  assert.match(shellLoader, /listPublicOfferingLinks/)
  assert.doesNotMatch(shellLoader, /listPublicOfferings|listPublicTenantPages/)

  assert.match(offeringLinksLoader, /SELECT id, name, slug, canonical_path/)
  assert.doesNotMatch(offeringLinksLoader, /body|features|faqs|media_asset_ids|SELECT\s+o\.\*/)
})

test('Blawby shell has no runtime font or icon provider dependency', () => {
  const layout = readFileSync('layouts/blawby.vue', 'utf8')
  const header = readFileSync('components/blawby/BlawbyHeader.vue', 'utf8')
  const footer = readFileSync('components/blawby/BlawbyFooter.vue', 'utf8')
  const nuxtConfig = readFileSync('nuxt.config.ts', 'utf8')

  assert.doesNotMatch(`${layout}\n${header}\n${footer}`, /fonts\.googleapis|UIcon|<U[A-Z]/)
  assert.match(header, /<svg/)
  assert.match(nuxtConfig, /name: 'Marcellus'.*weights: \[400\]/)
})

test('Blawby shield geometry is the pinned source path and cannot be supplied by tenant data', () => {
  const divider = readFileSync('components/blawby/BlawbyShieldDivider.vue', 'utf8')
  const editor = readFileSync('server/utils/professional-services-editor.ts', 'utf8')

  assert.match(divider, /M0 0H1920V23\.4197C1920 40\.325/)
  assert.match(divider, /viewBox="0 0 1920 160"/)
  assert.doesNotMatch(editor, /dividerPath|shieldPath|svgPath/)
})
