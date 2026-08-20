import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolveBlawbyRouteTarget } from '../../composables/useBlawbyDocument.ts'
import { getPublicBlawbyRouteData, hasPublicBlawbyRouteContent } from '../../server/utils/professional-services.ts'
import { isBlawbyShellOnlyRouteRecipe } from '../../types/blawby.ts'

test('Blawby links uses the combined document shell recipe without tenant-page content', async () => {
  assert.deepEqual(resolveBlawbyRouteTarget('/links'), { recipe: 'links', slug: null })
  assert.deepEqual(resolveBlawbyRouteTarget('/preview/site/site-ncls-blawby/links'), { recipe: 'links', slug: null })
  assert.equal(isBlawbyShellOnlyRouteRecipe('links'), true)
  const route = await getPublicBlawbyRouteData({} as never, 'site-ncls-blawby', 'links')
  assert.deepEqual(route, {
    recipe: 'links',
    page: null,
    offerings: [],
    offering: null,
    qa: [],
    reviews: [],
    posts: [],
    post: null,
  })
  assert.equal(hasPublicBlawbyRouteContent(route), true)
})

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
  const fontCss = readFileSync('assets/css/public-fonts.css', 'utf8')
  const blawbyEntryCss = readFileSync('assets/css/blawby-entry.css', 'utf8')

  assert.doesNotMatch(`${layout}\n${header}\n${footer}`, /fonts\.googleapis|UIcon|<U[A-Z]/)
  assert.match(header, /<svg/)
  assert.match(blawbyEntryCss, /@import "\.\/public-fonts\.css";/)
  assert.match(fontCss, /font-family:\s*["']Marcellus["'];[\s\S]*font-weight:\s*400;/)
  assert.match(fontCss, /font-family:\s*["']Poppins["'];[\s\S]*font-weight:\s*600;/)
})

test('public layouts use the shared SSR surface stylesheet contract', () => {
  const layouts = [
    ['access', 'platform-entry', 'platformStylesheet', 'platformStylesheetHref'],
    ['blog', 'platform-entry', 'platformStylesheet', 'platformStylesheetHref'],
    ['docs', 'platform-entry', 'platformStylesheet', 'platformStylesheetHref'],
    ['platform', 'platform-entry', 'platformStylesheet', 'platformStylesheetHref'],
    ['saya', 'saya-entry', 'sayaStylesheet', 'sayaStylesheetForRoute'],
    ['blawby', 'blawby-entry', 'blawbyStylesheet', 'blawbyStylesheetForRoute'],
  ] as const

  for (const [layoutName, sourceName, _stylesheetBinding, hrefBinding] of layouts) {
    const layout = readFileSync(`layouts/${layoutName}.vue`, 'utf8')
    assert.match(layout, new RegExp(`import ['\"]~\\/assets\\/css\\/${sourceName}\\.css['\"]`))
    assert.match(layout, /useHead\([\s\S]*rel: 'stylesheet'/)
    assert.match(layout, new RegExp(`href: ${hrefBinding}`))
  }
})

test('Blawby theme is a dedicated semantic Nuxt UI token scope', () => {
  const layout = readFileSync('layouts/blawby.vue', 'utf8')
  const baseCss = readFileSync('assets/css/base.css', 'utf8')
  const blawbyEntryCss = readFileSync('assets/css/blawby-entry.css', 'utf8')
  const blawbyCss = readFileSync('assets/css/blawby.css', 'utf8')
  const commandSearch = readFileSync('components/platform/search/PlatformCommandSearchModal.vue', 'utf8')
  const commandTrigger = readFileSync('components/platform/search/PlatformCommandSearchTrigger.vue', 'utf8')

  assert.match(blawbyEntryCss, /@import "\.\/blawby\.css";/)
  assert.doesNotMatch(baseCss, /@import "\.\/blawby\.css";/)
  assert.match(layout, /class="[^"]*\bblawby-shell\b[^"]*\bblawby-theme\b[^"]*"/)
  assert.match(layout, /bg-default text-default/)
  assert.ok(layout.includes("import '~/assets/css/blawby-entry.css'"))
  assert.match(layout, /rel: 'stylesheet'/)
  assert.match(layout, /href: blawbyStylesheetForRoute/)
  assert.doesNotMatch(layout, /'--blawby-(?:bg|surface|primary|accent|border|ink)'/)
  assert.match(layout, /'--blawby-token-primary'/)

  assert.match(blawbyCss, /\.blawby-theme\s*{/)
  // Blawby intentionally has no dark-mode variant — a professional-service
  // tenant site should render identically regardless of the visitor's system
  // color-scheme preference, not flip to a different, less-tested palette.
  assert.doesNotMatch(blawbyCss, /\.dark \.blawby-theme/)
  assert.match(blawbyCss, /color-scheme:\s*light/)
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
