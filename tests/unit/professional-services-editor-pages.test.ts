import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

type Store = {
  pages: Array<Record<string, unknown>>
  media: Array<Record<string, unknown>>
  batches: Array<Array<{ query: string; params?: unknown[] }>>
}

const store: Store = {
  pages: [],
  media: [],
  batches: [],
}

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM tenant_pages')) {
    const [organizationId, siteId, path] = params
    return store.pages.filter(page =>
      page.organization_id === organizationId &&
      page.site_id === siteId &&
      (path ? page.path === path : true),
    ) as T[]
  }

  if (query.includes('FROM media_assets')) {
    const [siteId, assetId] = params
    return store.media.filter(asset => asset.site_id === siteId && asset.id === assetId) as T[]
  }

  if (query.includes('FROM offerings')) return [] as T[]

  throw new Error(`Unexpected query: ${query}`)
}

async function executeBatch(_db: unknown, statements: Array<{ query: string; params?: unknown[] }>) {
  store.batches.push(statements)
  for (const statement of statements) {
    if (!statement.query.includes('UPDATE tenant_pages')) continue
    const params = statement.params ?? []
    const [title, summary, componentsJson, updatedBy, organizationId, siteId, path] = params
    const page = store.pages.find(row =>
      row.organization_id === organizationId &&
      row.site_id === siteId &&
      row.path === path,
    )
    if (!page) continue
    page.title = title
    page.summary = summary
    page.components_json = componentsJson
    page.updated_by = updatedBy
  }
  return []
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    executeBatch,
    queryAll,
  },
})

mock.module('../../server/utils/professional-services.ts', {
  namedExports: {
    getPublicBlawbyData: async () => ({
      offerings: [],
      tenantPages: [],
      compliance: null,
      consultation: null,
      navigation: [],
      themeTokens: {},
    }),
  },
})

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cleanString: (value: unknown, maxLength = 1000) =>
      typeof value === 'string' ? value.trim().slice(0, maxLength) : '',
  },
})

const {
  getProfessionalServiceEditorPageContent,
  updateProfessionalServiceEditorPageContent,
} = await import('../../server/utils/professional-services-editor.ts')

function resetStore() {
  store.pages = [
    {
      id: 'page_ncls_home',
      organization_id: 'org-ncls-blawby',
      site_id: 'site-ncls-blawby',
      path: '/',
      title: 'North Carolina Legal Services',
      summary: 'Legal support across North Carolina.',
      components_json: JSON.stringify([
        {
          type: 'home_hero',
          title: 'Legal help when it matters',
          description: 'Support for families across North Carolina.',
          background: { asset_id: 'asset-home', url: 'https://images.example/home.webp' },
        },
        { type: 'services_intro', title: 'Our', accent: 'Services', description: 'Practice areas.' },
        { type: 'consultation_cta', title: 'Request help', description: 'Start with a consultation.' },
      ]),
      updated_at: '2026-07-21T00:00:00.000Z',
    },
    {
      id: 'page_ncls_contact',
      organization_id: 'org-ncls-blawby',
      site_id: 'site-ncls-blawby',
      path: '/contact',
      title: 'Contact Us',
      summary: 'Reach the intake team.',
      components_json: JSON.stringify([
        { type: 'page_hero', title: 'Contact Us', description: 'Reach the intake team.' },
        { type: 'contact_cards', title: 'Get in touch', description: 'Choose the right channel.', cardsContent: ['<h3>Call</h3><p>919-555-0100</p>'] },
      ]),
      updated_at: '2026-07-21T00:00:00.000Z',
    },
  ]
  store.media = [{ id: 'asset-home-new', site_id: 'site-ncls-blawby', public_url: 'https://images.example/new-home.webp' }]
  store.batches = []
}

test('professional_services page editor reads rendered Blawby tenant_page fields', async () => {
  resetStore()
  const content = await getProfessionalServiceEditorPageContent(
    {},
    'org-ncls-blawby',
    'site-ncls-blawby',
    'home',
  )

  const hero = content.fields.find((field: { field: string }) => field.field === 'hero')
  assert.equal(hero?.hero_title, 'Legal help when it matters')
  assert.equal(hero?.hero_subtitle, 'Support for families across North Carolina.')
  assert.equal(hero?.hero_image_asset_id, 'asset-home')
  assert.deepEqual(content.schema.fields, ['hero.title', 'hero.subtitle', 'hero.image', 'cta.title', 'cta.description'])
})

test('professional_services page editor updates tenant_page components without dropping existing blocks', async () => {
  resetStore()
  await updateProfessionalServiceEditorPageContent({}, {
    organizationId: 'org-ncls-blawby',
    siteId: 'site-ncls-blawby',
    page: 'home',
    changes: {
      'hero.title': 'Updated legal help',
      'hero.image': 'asset-home-new',
      'cta.description': 'A new consultation note.',
    },
    updatedBy: 'user-ncls-blawby',
  })

  const page = store.pages.find(row => row.path === '/')!
  const components = JSON.parse(String(page.components_json)) as Array<Record<string, unknown>>
  assert.equal(page.title, 'Updated legal help')
  assert.equal(components.find(component => component.type === 'services_intro')?.description, 'Practice areas.')
  assert.deepEqual(components.find(component => component.type === 'home_hero')?.background, {
    asset_id: 'asset-home-new',
    url: 'https://images.example/new-home.webp',
  })
  assert.equal(components.find(component => component.type === 'consultation_cta')?.description, 'A new consultation note.')
})

test('professional_services page editor rejects unrendered shared-registry fields', async () => {
  resetStore()
  await assert.rejects(
    updateProfessionalServiceEditorPageContent({}, {
      organizationId: 'org-ncls-blawby',
      siteId: 'site-ncls-blawby',
      page: 'contact',
      changes: { 'story.body': 'This shared Saya field is not a Blawby contact component.' },
    }),
    /Field "story\.body" is not editable on page "contact"/,
  )
})
