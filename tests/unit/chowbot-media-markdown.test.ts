import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

// --- Fakes for the leaf dependencies chowbot-media.ts touches -------------
// Mirrors the mock.module convention used by tests/unit/content-documents.test.ts
// and tests/unit/billing-plans.test.ts: mock the narrow external-effect
// boundary (DB helpers, AI gateway, R2) rather than reimplementing D1/drizzle.

interface FakeAsset {
  id: string
  site_id: string
  public_url: string | null
  mime_type: string | null
  file_name: string | null
}

const assets = new Map<string, FakeAsset>()
const createdAssets: Array<Record<string, unknown>> = []
const uploadedToR2: Array<{ key: string; contentType: string }> = []

let creditsAvailable = true
let chargeCreditsCalls = 0
let aiGatewayResponse: { text: string; inputTokens?: number; outputTokens?: number } | null = null
let aiGatewayCallCount = 0

mock.module('../../server/utils/media-asset-manager.ts', {
  namedExports: {
    async createMediaAsset(_db: unknown, data: Record<string, unknown>) {
      createdAssets.push(data)
      assets.set(data.id as string, {
        id: data.id as string,
        site_id: data.site_id as string,
        public_url: (data.public_url as string) ?? null,
        mime_type: (data.mime_type as string) ?? null,
        file_name: (data.file_name as string) ?? null,
      })
    },
    async getMediaAsset(_db: unknown, id: string, siteId: string) {
      const asset = assets.get(id)
      if (!asset || asset.site_id !== siteId) return null
      return asset
    },
  },
})

const realAiCredits = await import('../../server/utils/ai-credits.ts')

mock.module('../../server/utils/ai-credits.ts', {
  namedExports: {
    ...realAiCredits,
    async hasCredits() {
      return creditsAvailable
    },
    async chargeCredits() {
      chargeCreditsCalls += 1
      return { creditsCharged: 1, newBalance: 499 }
    },
  },
})

// Keep textBlock/documentBlock/imageBlock real (pure), only replace the
// network-calling callAiGateway.
const { textBlock: realTextBlock, imageBlock: realImageBlock, documentBlock: realDocumentBlock } =
  await import('../../server/utils/ai-gateway.ts')

mock.module('../../server/utils/ai-gateway.ts', {
  namedExports: {
    textBlock: realTextBlock,
    imageBlock: realImageBlock,
    documentBlock: realDocumentBlock,
    async callAiGateway() {
      aiGatewayCallCount += 1
      if (!aiGatewayResponse) throw new Error('unexpected AI gateway call in test')
      return {
        content: [{ type: 'text', text: aiGatewayResponse.text }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: aiGatewayResponse.inputTokens ?? 100,
          output_tokens: aiGatewayResponse.outputTokens ?? 50,
        },
        cfLogId: 'log-test',
      }
    },
  },
})

mock.module('../../server/utils/cloudflare-r2.ts', {
  namedExports: {
    buildR2Key(siteId: string, assetId: string, filename: string) {
      return `sites/${siteId}/${assetId}/${filename}`
    },
    async uploadToR2(_env: unknown, key: string, _body: unknown, contentType: string) {
      uploadedToR2.push({ key, contentType })
      return `https://media.example.test/${key}`
    },
    async deleteFromR2() {},
  },
})

const { saveInboundMediaAsset, analyzeDocumentAsset } = await import('../../server/utils/chowbot-media.ts')

const FAKE_DB = {} as unknown as D1Database
const FAKE_ENV = {} as unknown as Record<string, unknown>

function withGlobalFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return run().finally(() => {
    globalThis.fetch = original
  })
}

// ---------------------------------------------------------------------------
// saveInboundMediaAsset — upload validation
// ---------------------------------------------------------------------------

test('saveInboundMediaAsset accepts a .md upload with an explicit text/markdown MIME type', async () => {
  createdAssets.length = 0
  uploadedToR2.length = 0

  const bytes = new TextEncoder().encode('# Hello\n\nWorld.').buffer
  const asset = await saveInboundMediaAsset(FAKE_DB, FAKE_ENV as never, {
    organizationId: 'org-1',
    siteId: 'site-1',
    userId: 'user-1',
    bytes,
    mimeType: 'text/markdown',
    fileSize: bytes.byteLength,
    filename: 'notes.md',
  })

  assert.equal(createdAssets.length, 1)
  assert.equal(createdAssets[0]?.kind, 'file')
  assert.equal(createdAssets[0]?.mime_type, 'text/markdown')
  assert.equal(uploadedToR2.length, 1)
  assert.equal(uploadedToR2[0]?.contentType, 'text/markdown')
  assert.ok(asset.public_url)
})

test('saveInboundMediaAsset accepts a .markdown upload even when the reported MIME type is generic', async () => {
  createdAssets.length = 0

  const bytes = new TextEncoder().encode('# Doc').buffer
  await saveInboundMediaAsset(FAKE_DB, FAKE_ENV as never, {
    organizationId: 'org-1',
    siteId: 'site-1',
    userId: 'user-1',
    bytes,
    mimeType: 'application/octet-stream',
    fileSize: bytes.byteLength,
    filename: 'README.MARKDOWN',
  })

  assert.equal(createdAssets[0]?.mime_type, 'text/markdown')
})

test('saveInboundMediaAsset rejects an oversized Markdown file before touching storage', async () => {
  createdAssets.length = 0
  uploadedToR2.length = 0

  const oversized = new ArrayBuffer(5 * 1024 * 1024 + 1)
  await assert.rejects(
    () =>
      saveInboundMediaAsset(FAKE_DB, FAKE_ENV as never, {
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
        bytes: oversized,
        mimeType: 'text/markdown',
        fileSize: oversized.byteLength,
        filename: 'huge.md',
      }),
    /too large/i,
  )
  assert.equal(createdAssets.length, 0, 'must not persist an asset that failed size validation')
  assert.equal(uploadedToR2.length, 0, 'must not upload bytes that failed size validation')
})

test('saveInboundMediaAsset rejects a Markdown file with invalid UTF-8 content', async () => {
  createdAssets.length = 0

  const invalid = new Uint8Array([0x23, 0x20, 0xff, 0xfe, 0x41]).buffer
  await assert.rejects(
    () =>
      saveInboundMediaAsset(FAKE_DB, FAKE_ENV as never, {
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
        bytes: invalid,
        mimeType: 'text/markdown',
        fileSize: invalid.byteLength,
        filename: 'bad-encoding.md',
      }),
    /not valid UTF-8/i,
  )
  assert.equal(createdAssets.length, 0)
})

test('saveInboundMediaAsset still rejects a genuinely unsupported file type', async () => {
  const bytes = new ArrayBuffer(10)
  await assert.rejects(
    () =>
      saveInboundMediaAsset(FAKE_DB, FAKE_ENV as never, {
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
        bytes,
        mimeType: 'application/zip',
        fileSize: bytes.byteLength,
        filename: 'archive.zip',
      }),
    /Unsupported media type/,
  )
})

// ---------------------------------------------------------------------------
// analyzeDocumentAsset — analysis + error handling
// ---------------------------------------------------------------------------

function seedAsset(overrides: Partial<FakeAsset> = {}) {
  const asset: FakeAsset = {
    id: 'asset-1',
    site_id: 'site-1',
    public_url: 'https://media.example.test/doc.md',
    mime_type: 'text/markdown',
    file_name: 'doc.md',
    ...overrides,
  }
  assets.set(asset.id, asset)
  return asset
}

test('analyzeDocumentAsset summarizes a Markdown file grounded in its parsed structure', async () => {
  assets.clear()
  seedAsset()
  creditsAvailable = true
  chargeCreditsCalls = 0
  aiGatewayCallCount = 0
  aiGatewayResponse = { text: 'This document covers pricing and hours.' }

  const markdown = '# Hours\n\n- Mon-Fri: 9am-5pm\n- Sat: 10am-2pm\n\n## Pricing\n\n| Item | Price |\n| --- | --- |\n| Coffee | 3.50 |\n'

  const result = await withGlobalFetch(
    async () => new Response(markdown, { status: 200 }),
    () =>
      analyzeDocumentAsset(FAKE_DB, FAKE_ENV as never, {
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
        assetId: 'asset-1',
      }),
  )

  assert.equal(result.answer, 'This document covers pricing and hours.')
  assert.equal(result.creditsRemaining, 499)
  assert.equal(result.stats.headings, 2)
  assert.equal(result.stats.tableRows, 1)
  assert.equal(chargeCreditsCalls, 1)
  assert.equal(aiGatewayCallCount, 1)
})

test('analyzeDocumentAsset answers a grounded question using the provided question text', async () => {
  assets.clear()
  seedAsset()
  creditsAvailable = true
  aiGatewayResponse = { text: 'Coffee costs 3.50.' }

  const markdown = '# Menu\n\n| Item | Price |\n| --- | --- |\n| Coffee | 3.50 |\n'

  const result = await withGlobalFetch(
    async () => new Response(markdown, { status: 200 }),
    () =>
      analyzeDocumentAsset(FAKE_DB, FAKE_ENV as never, {
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
        assetId: 'asset-1',
        question: 'How much is coffee?',
      }),
  )

  assert.equal(result.answer, 'Coffee costs 3.50.')
})

test('analyzeDocumentAsset rejects a missing asset', async () => {
  assets.clear()
  await assert.rejects(
    () =>
      analyzeDocumentAsset(FAKE_DB, FAKE_ENV as never, {
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
        assetId: 'missing-asset',
      }),
    /Media asset not found/,
  )
})

test('analyzeDocumentAsset rejects an asset whose MIME type is not Markdown', async () => {
  assets.clear()
  seedAsset({ mime_type: 'application/pdf', file_name: 'menu.pdf' })
  await assert.rejects(
    () =>
      analyzeDocumentAsset(FAKE_DB, FAKE_ENV as never, {
        organizationId: 'org-1',
        siteId: 'site-1',
        userId: 'user-1',
        assetId: 'asset-1',
      }),
    /Unsupported media type for document analysis/,
  )
})

test('analyzeDocumentAsset rejects an oversized document fetched from storage', async () => {
  assets.clear()
  seedAsset()
  const oversized = 'a'.repeat(5 * 1024 * 1024 + 1)

  await assert.rejects(
    () =>
      withGlobalFetch(
        async () => new Response(oversized, { status: 200 }),
        () =>
          analyzeDocumentAsset(FAKE_DB, FAKE_ENV as never, {
            organizationId: 'org-1',
            siteId: 'site-1',
            userId: 'user-1',
            assetId: 'asset-1',
          }),
      ),
    /too large/i,
  )
})

test('analyzeDocumentAsset rejects a document with invalid UTF-8 content fetched from storage', async () => {
  assets.clear()
  seedAsset()
  const invalidBytes = new Uint8Array([0x23, 0x20, 0xff, 0xfe, 0x41])

  await assert.rejects(
    () =>
      withGlobalFetch(
        async () => new Response(invalidBytes, { status: 200 }),
        () =>
          analyzeDocumentAsset(FAKE_DB, FAKE_ENV as never, {
            organizationId: 'org-1',
            siteId: 'site-1',
            userId: 'user-1',
            assetId: 'asset-1',
          }),
      ),
    /not valid UTF-8/i,
  )
})

test('analyzeDocumentAsset rejects when the organization has no AI credits remaining', async () => {
  assets.clear()
  seedAsset()
  creditsAvailable = false

  await assert.rejects(
    () =>
      withGlobalFetch(
        async () => new Response('# Doc', { status: 200 }),
        () =>
          analyzeDocumentAsset(FAKE_DB, FAKE_ENV as never, {
            organizationId: 'org-1',
            siteId: 'site-1',
            userId: 'user-1',
            assetId: 'asset-1',
          }),
      ),
    /No AI credits remaining/,
  )
  creditsAvailable = true
})
