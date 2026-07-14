import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProfessionalServiceGraph,
  normalizeNonprofitStatus,
  type ProfessionalServiceOrgIdentity,
  type ProfessionalServiceSchemaInput,
} from '../../utils/professional-service-schema.ts'

// The shared Organization node's @type is itself a multi-type array (e.g.
// ['Organization', 'LegalService']) since the tenant's entityType is echoed
// onto it — so a naive "includes(type)" search would wrongly match the
// Organization node when looking up the page's own LegalService/etc. node.
// Skip the Organization node explicitly so callers reliably get the
// recipe-specific node instead.
function graphByType(graph: { '@graph': Array<Record<string, unknown>> }, type: string) {
  return graph['@graph'].find((node) => {
    const nodeType = node['@type']
    const types = Array.isArray(nodeType) ? nodeType : [nodeType]
    if (type !== 'Organization' && types.includes('Organization')) return false
    return types.includes(type)
  })
}

test('normalizeNonprofitStatus maps common free-text forms to the schema.org enum URL', () => {
  assert.deepEqual(normalizeNonprofitStatus('501(c)(3)'), { value: 'https://schema.org/Nonprofit501c3', valid: true })
  assert.deepEqual(normalizeNonprofitStatus('501c3'), { value: 'https://schema.org/Nonprofit501c3', valid: true })
  assert.deepEqual(normalizeNonprofitStatus('  501 (c) (6)  '), { value: 'https://schema.org/Nonprofit501c6', valid: true })
  assert.deepEqual(normalizeNonprofitStatus('https://schema.org/Nonprofit501c3'), { value: 'https://schema.org/Nonprofit501c3', valid: true })
})

test('normalizeNonprofitStatus treats empty/null as valid (no status)', () => {
  assert.deepEqual(normalizeNonprofitStatus(null), { value: null, valid: true })
  assert.deepEqual(normalizeNonprofitStatus(''), { value: null, valid: true })
  assert.deepEqual(normalizeNonprofitStatus('   '), { value: null, valid: true })
})

test('normalizeNonprofitStatus rejects unrecognized values instead of silently passing them through', () => {
  const result = normalizeNonprofitStatus('a registered nonprofit')
  assert.equal(result.valid, false)
  const outOfRange = normalizeNonprofitStatus('501(c)(99)')
  assert.equal(outOfRange.valid, false)
  const wrongDomain = normalizeNonprofitStatus('https://example.com/Nonprofit501c3')
  assert.equal(wrongDomain.valid, false)
})

const nclsOrg: ProfessionalServiceOrgIdentity = {
  name: 'North Carolina Legal Services',
  description: 'Access to Justice for All.',
  logoUrl: '/logo.svg',
  entityType: 'LegalService',
  nonprofitStatus: '501(c)(3)',
  serviceArea: 'North Carolina',
  serviceAreaType: 'State',
  sameAs: ['https://www.facebook.com/northcarolinalegalservices'],
  founderName: 'Rich Gittings',
  foundingDate: '2010-01-01',
  contactPoints: [{ contact_type: 'customer service', telephone: '(984) 777-8288', email: 'contact@example.org' }],
  address: null,
  addressVisible: false,
}

test('buildProfessionalServiceGraph emits a linked Organization/WebSite graph with stable, canonical-origin IDs', () => {
  const input: ProfessionalServiceSchemaInput = {
    recipe: 'home',
    origin: 'https://ncls.krabiclaw.com',
    org: nclsOrg,
    pageUrl: '/',
    pageTitle: 'North Carolina Legal Services',
  }
  const graph = buildProfessionalServiceGraph(input)
  const org = graphByType(graph, 'Organization')!
  const site = graphByType(graph, 'WebSite')!

  assert.equal(org['@id'], 'https://ncls.krabiclaw.com/#organization')
  assert.equal(site['@id'], 'https://ncls.krabiclaw.com/#website')
  assert.deepEqual((site as Record<string, unknown>).publisher, { '@id': 'https://ncls.krabiclaw.com/#organization' })
  // The org node must emit the canonical enum URL, never the raw "501(c)(3)" free text.
  assert.equal(org.nonprofitStatus, 'https://schema.org/Nonprofit501c3')
  assert.deepEqual(org['@type'], ['Organization', 'LegalService'])
})

test('service-detail recipe links LegalService back to the shared Organization node and includes breadcrumbs', () => {
  const input: ProfessionalServiceSchemaInput = {
    recipe: 'service-detail',
    origin: 'https://ncls.krabiclaw.com',
    org: nclsOrg,
    pageUrl: '/services/family',
    pageTitle: 'Family law',
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Services', url: '/services' },
      { name: 'Family law', url: '/services/family' },
    ],
    faqs: [{ question: 'Do you handle custody?', answer: 'Yes.' }],
    offering: { name: 'Family law', schemaType: 'LegalService' },
  }
  const graph = buildProfessionalServiceGraph(input)
  const service = graphByType(graph, 'LegalService')
  const breadcrumb = graphByType(graph, 'BreadcrumbList')
  const faq = graphByType(graph, 'FAQPage')

  assert.ok(service, 'expected a LegalService node')
  assert.deepEqual((service as Record<string, unknown>).provider, { '@id': 'https://ncls.krabiclaw.com/#organization' })
  assert.ok(breadcrumb, 'expected a BreadcrumbList node')
  assert.equal((breadcrumb as Record<string, unknown[]>).itemListElement?.length, 3)
  assert.ok(faq, 'expected a FAQPage node since faqs were provided')
})

test('FAQPage is never emitted when no visible FAQ items are passed (no phantom FAQ schema)', () => {
  const input: ProfessionalServiceSchemaInput = {
    recipe: 'about',
    origin: 'https://ncls.krabiclaw.com',
    org: nclsOrg,
    pageUrl: '/about',
    pageTitle: 'About',
    faqs: [],
  }
  const graph = buildProfessionalServiceGraph(input)
  assert.equal(graphByType(graph, 'FAQPage'), undefined)

  const withBlankAnswer = buildProfessionalServiceGraph({
    ...input,
    faqs: [{ question: 'What are your hours?', answer: '   ' }],
  })
  assert.equal(graphByType(withBlankAnswer, 'FAQPage'), undefined)
})

test('template-driven generation: a distinct non-NCLS professional-service tenant produces its own graph, not NCLS-hardcoded values', () => {
  const accountingOrg: ProfessionalServiceOrgIdentity = {
    name: 'Cascade Tax & Accounting',
    description: 'CPA services for small businesses in Oregon.',
    logoUrl: '/cascade-logo.svg',
    entityType: 'AccountingService',
    nonprofitStatus: null,
    serviceArea: 'Oregon',
    serviceAreaType: 'State',
    sameAs: ['https://www.linkedin.com/company/cascade-tax'],
    founderName: 'Jamie Alvarez',
    foundingDate: '2015-06-01',
    contactPoints: [{ contact_type: 'customer service', telephone: '(503) 555-0101', email: 'hello@cascadetax.example' }],
    address: null,
    addressVisible: false,
  }

  const home = buildProfessionalServiceGraph({
    recipe: 'home',
    origin: 'https://cascadetax.example',
    org: accountingOrg,
    pageUrl: '/',
    pageTitle: 'Cascade Tax & Accounting',
  })
  const org = graphByType(home, 'Organization')!
  assert.deepEqual(org['@type'], ['Organization', 'AccountingService'])
  assert.equal(org.name, 'Cascade Tax & Accounting')
  assert.equal(org.nonprofitStatus, undefined, 'a for-profit tenant must never inherit NCLS nonprofit status')
  assert.equal(org['@id'], 'https://cascadetax.example/#organization')

  const detail = buildProfessionalServiceGraph({
    recipe: 'service-detail',
    origin: 'https://cascadetax.example',
    org: accountingOrg,
    pageUrl: '/services/bookkeeping',
    pageTitle: 'Bookkeeping',
    offering: { name: 'Bookkeeping', schemaType: 'AccountingService', offers: [{ name: 'Monthly bookkeeping', price: '299', priceCurrency: 'USD' }] },
  })
  const service = graphByType(detail, 'AccountingService')
  assert.ok(service, 'expected the offering-specific @type to be honored per-tenant, not hardcoded to LegalService')
  assert.deepEqual((service as Record<string, unknown>).offers, [
    { '@type': 'Offer', name: 'Monthly bookkeeping', price: '299', priceCurrency: 'USD' },
  ])
})

test('pricing recipe emits an OfferCatalog linked to the provider', () => {
  const input: ProfessionalServiceSchemaInput = {
    recipe: 'pricing',
    origin: 'https://ncls.krabiclaw.com',
    org: nclsOrg,
    pageUrl: '/pricing',
    pageTitle: 'Pricing',
    offerCatalog: [{ name: 'Free consultation', price: '0', priceCurrency: 'USD' }],
  }
  const graph = buildProfessionalServiceGraph(input)
  const catalog = graphByType(graph, 'OfferCatalog')
  assert.ok(catalog)
  assert.deepEqual((catalog as Record<string, unknown>).provider, { '@id': 'https://ncls.krabiclaw.com/#organization' })
})

test('article recipe emits BlogPosting with publisher/isPartOf pointing at the shared graph', () => {
  const input: ProfessionalServiceSchemaInput = {
    recipe: 'article',
    origin: 'https://ncls.krabiclaw.com',
    org: nclsOrg,
    pageUrl: '/article/example-post',
    pageTitle: 'Example post',
    article: { headline: 'Example post', authorName: 'Rich Gittings', datePublished: '2026-01-01' },
  }
  const graph = buildProfessionalServiceGraph(input)
  const article = graphByType(graph, 'BlogPosting')!
  assert.deepEqual((article as Record<string, unknown>).publisher, { '@id': 'https://ncls.krabiclaw.com/#organization' })
  assert.deepEqual((article as Record<string, unknown>).isPartOf, { '@id': 'https://ncls.krabiclaw.com/#website' })
})
