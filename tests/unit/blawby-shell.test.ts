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

test('Blawby theme is a dedicated semantic Nuxt UI token scope', () => {
  const layout = readFileSync('layouts/blawby.vue', 'utf8')
  const mainCss = readFileSync('assets/css/main.css', 'utf8')
  const blawbyCss = readFileSync('assets/css/blawby.css', 'utf8')
  const commandSearch = readFileSync('components/platform/search/PlatformCommandSearchModal.vue', 'utf8')
  const commandTrigger = readFileSync('components/platform/search/PlatformCommandSearchTrigger.vue', 'utf8')

  assert.match(mainCss, /@import "\.\/blawby\.css";/)
  assert.match(layout, /class="[^"]*\bblawby-shell\b[^"]*\bblawby-theme\b[^"]*"/)
  assert.match(layout, /bg-default text-default/)
  assert.doesNotMatch(layout, /<style\b/)
  assert.doesNotMatch(layout, /'--blawby-(?:bg|surface|primary|accent|border|ink)'/)
  assert.match(layout, /'--blawby-token-primary'/)

  assert.match(blawbyCss, /\.blawby-theme\s*{/)
  assert.match(blawbyCss, /\.dark \.blawby-theme\s*{/)
  assert.match(blawbyCss, /--ui-primary:\s*var\(--blawby-primary\)/)
  assert.match(blawbyCss, /--ui-bg:\s*var\(--blawby-bg\)/)
  assert.match(blawbyCss, /--ui-text:\s*var\(--blawby-ink\)/)
  assert.match(blawbyCss, /--color-primary:\s*var\(--blawby-primary\)/)
  assert.match(blawbyCss, /--primary-foreground:/)

  assert.match(commandSearch, /const BLAWBY_PALETTE: SearchPalette = PLATFORM_PALETTE/)
  assert.doesNotMatch(commandSearch, /search-blawby-/)
  assert.doesNotMatch(commandTrigger, /--blawby-/)
  assert.match(commandTrigger, /border-default bg-default\/80 hover:border-muted hover:bg-elevated/)
})

test('Blawby shield geometry is the pinned source path and cannot be supplied by tenant data', () => {
  const divider = readFileSync('components/blawby/BlawbyShieldDivider.vue', 'utf8')
  const editor = readFileSync('server/utils/professional-services-editor.ts', 'utf8')

  assert.match(divider, /M0 0H1920V23\.4197C1920 40\.325/)
  assert.match(divider, /viewBox="0 0 1920 160"/)
  assert.doesNotMatch(editor, /dividerPath|shieldPath|svgPath/)
})
