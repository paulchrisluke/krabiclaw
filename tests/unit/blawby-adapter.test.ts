import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function runAdapter(source: string) {
  const dir = mkdtempSync(join(tmpdir(), 'blawby-adapter-'))
  const sourcePath = join(dir, 'northcarolinalegalservices.ts')
  writeFileSync(sourcePath, source, 'utf8')
  const result = spawnSync(
    process.execPath,
    ['scripts/adapters/ncls-blawby.mjs', '--source', sourcePath, '--stdout'],
    { cwd: process.cwd(), encoding: 'utf8' },
  )
  rmSync(dir, { recursive: true, force: true })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

const sourceFixture = `
const domain = 'northcarolinalegalservices.org'

export const northcarolinalegalservices: ISeedTenant = {
  tenant: {
    name: 'North Carolina Legal Services',
    legalName: 'North Carolina Legal Services',
    founder: 'Rich Gittings',
    type: 'LegalService',
    languages: ['English'],
    description: 'Affordable legal services for North Carolina.',
    domain,
    email: 'contact@northcarolinalegalservices.org',
    phone: '(919) 886-4134',
    keywords: ['North Carolina Legal Services'],
    logo: '/logo.webp',
    footerDescription: 'See our <a href="/files/FinalLetter_88-0565637_BULLCITYLEGALSERVICESINC_Redacted.pdf">IRS Determination Letter</a>.',
    disclaimer: 'Informational only.',
    fonts: ['https://fonts.googleapis.com/css2?family=Marcellus&family=Poppins:wght@400;600&display=swap'],
    calendlyUrl: 'https://calendly.com/old-link',
    paymentBaseUrl: 'https://app.blawby.com/northcarolinalegalservices/pay',
    googleTagManagerId: 'GTM-MDHRQP5',
    customHeadCode: '<script>custom()</script>',
    features: [{ title: 'Mission', desc: 'Access to justice.', icon: 'mission.svg' }],
  },
  serviceArea: { locality: 'North Carolina', region: 'NC' },
  impactStats: { title: 'Impact', description: 'Closing the justice gap.', additionalDescription: 'Every gift helps.' },
  pagesMetadata: [
    { type: 'pricing', title: 'Pricing', description: 'Transparent fees.' },
    { type: 'donate', title: 'Donate', description: 'Support access to justice.' },
  ],
  priceTableComponent: {
    description: 'Sliding-scale estimator.',
    notice: 'Estimate only.',
    source: 'Reviewed 2026 NCLS fee policy',
    effectiveDate: '2026-01-01',
  },
  services: [{
    name: 'Family law',
    slug: 'family',
    serviceType: 'Practice Area',
    summary: 'Family support.',
    description: 'Family law help.',
    content: 'Detailed family law help.',
    order: 1,
    itemType: 'LegalService',
    thumbnailFileName: 'family-law.webp',
    features: [{ title: 'Custody', description: 'Custody help.', img: 'childcustody.webp' }],
    faqs: [{ question: 'How do I start?', answer: 'Schedule a consultation.' }],
  }],
  articles: [{
    title: 'Preparing for your consultation',
    slug: 'preparing-for-your-consultation',
    description: 'How to prepare.',
    content: 'Bring documents.',
    tags: ['Legal Services'],
    keywords: ['consultation'],
    imageName: 'preparing-for-your-consultation.webp',
  }],
  privacy: { content: 'Privacy policy.' },
  terms: { content: 'Terms of use.' },
  thirdPartyNotice: { content: 'Third-party notices.' },
  scheduleRedirectComponent: { buttonUrl: 'https://ncls.cliogrow.com/book' },
}
`

test('NCLS Blawby adapter normalizes source data into cutover artifacts', () => {
  const payload = runAdapter(sourceFixture)

  assert.equal(payload.site.vertical, 'service')
  assert.equal(payload.site.theme_id, 'blawby-theme-v1')
  assert.equal(payload.consultation.external_url, 'https://ncls.cliogrow.com/book')
  assert.equal(payload.consultation.legacy_source_calendly_url_ignored, 'https://calendly.com/old-link')
  assert.equal(payload.analyticsBridge.container_id, 'GTM-MDHRQP5')
  assert.equal(payload.analyticsBridge.custom_head_code_ignored, true)
  assert.equal('fonts' in payload.themeTokens, false)
  assert.equal(payload.themeTokens.primary100, '#f2f5ff')

  assert.equal(payload.offerings.length, 1)
  assert.equal(payload.offerings[0].canonical_path, '/services/family')
  assert.equal(payload.tenantPages.find((page: { path: string }) => page.path === '/donate')?.cta_url, 'https://app.blawby.com/northcarolinalegalservices/pay/donate')
  assert.equal(payload.articles[0].canonical_url, '/article/preparing-for-your-consultation')

  assert.ok(payload.mediaInventory.files.some((file: { kind: string }) => file.kind === 'legal_file'))
  assert.ok(payload.mediaInventory.files.some((file: { source_name?: string }) => file.source_name === 'family-law.webp'))
  assert.ok(payload.routeInventory.preservedRoutes.includes('/services/family'))
  assert.ok(payload.routeInventory.intentionalExclusions.some((route: { path: string }) => route.path === '/conference'))
  assert.ok(payload.editSurfaceMatrix.some((row: { area: string }) => row.area === 'offerings'))
  assert.ok(payload.intentionalDifferences.some((item: string) => item.includes('Calendly')))
})

test('NCLS Blawby adapter output is deterministic for stable source data', () => {
  const first = runAdapter(sourceFixture)
  const second = runAdapter(sourceFixture)

  assert.deepEqual(first, second)
})

test('Blawby artifact verifier passes a complete import manifest without a deployed URL', () => {
  const payload = runAdapter(sourceFixture)
  const dir = mkdtempSync(join(tmpdir(), 'blawby-verify-'))
  const manifestPath = join(dir, 'blawby-import.json')
  const outPath = join(dir, 'evidence.json')
  writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const result = spawnSync(
    process.execPath,
    ['scripts/verify-blawby-site.mjs', '--import-manifest', manifestPath, '--out', outPath],
    { cwd: process.cwd(), encoding: 'utf8' },
  )
  const report = JSON.parse(readFileSync(outPath, 'utf8'))
  rmSync(dir, { recursive: true, force: true })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(report.ok, true)
  assert.ok(report.checks.some((check: { label: string }) => check.label === 'Import manifest contains media inventory'))
})
