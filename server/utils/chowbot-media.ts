import { callAiGateway, documentBlock, imageBlock, textBlock } from '~/server/utils/ai-gateway'
import { chargeCredits, hasCredits } from '~/server/utils/ai-credits'
import { createProductsBatch } from '~/server/utils/product-management'
import { PRODUCT_DETAILS_INPUT_SCHEMA, validateProductDetails } from '~/server/utils/product-validation'
import type { CreateProductInput, Product } from '~/server/types/products'
import { uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { buildR2Key, uploadToR2 } from '~/server/utils/cloudflare-r2'
import { createMediaAsset, getMediaAsset, type MediaAsset } from '~/server/utils/media-asset-manager'
import { CHOWBOT_MODEL } from '~/server/utils/ai-models'
import { localizationError } from '~/server/utils/localization-errors'
import { queryFirst } from '~/server/db'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import {
  MARKDOWN_MIME_TYPES,
  assertMarkdownSize,
  decodeMarkdownText,
  parseMarkdownDocument,
  resolveMarkdownMimeType,
} from '~/server/utils/markdown-document'

const PRODUCT_EXTRACTION_TOOL_NAME = 'extract_products'
const extractionSystem = (currency: string) => `Extract location-owned Products only from text visibly present in the source. Never infer descriptions, prices, details, or order URLs. Set price to { amount_minor } in ${currency} when a fixed amount is clearly visible. Set price to null when the source has no fixed numeric amount. Copy explicit wording such as "Market Price" or "Ask Staff" into details as { key: "price-note", label: "Price", values: [the exact wording] }. Set price_unreadable to true when a price exists but is cropped, blurred, obscured, or otherwise unreadable. An unreadable price rejects the complete import, so never guess. Otherwise set price_unreadable to false. Call the extract_products tool exactly once. Use an empty items array when no Products can be read.`

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const PRODUCT_EXTRACTION_TOOL = {
  name: PRODUCT_EXTRACTION_TOOL_NAME,
  description: 'Return every Product visibly present in the supplied business media.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        maxItems: 100,
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            price: {
              type: ['object', 'null'],
              description: 'Fixed numeric price as an integer amount_minor, or null when the source has no fixed amount. Never use zero as a placeholder.',
              properties: { amount_minor: { type: 'integer', minimum: 0 } },
              required: ['amount_minor'],
              additionalProperties: false,
            },
            price_unreadable: { type: 'boolean', description: 'True only when visible price text exists but cannot be read confidently. This rejects the complete import.' },
            details: PRODUCT_DETAILS_INPUT_SCHEMA,
            order_url: { type: ['string', 'null'] },
          },
          required: ['category', 'name', 'description', 'price', 'price_unreadable', 'details', 'order_url'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
}

export function parseProductExtraction(input: unknown, currency: CurrencyCode): CreateProductInput[] {
  if (!isRecord(input)) {
    localizationError(422, 'PRODUCT_IMPORT_VALIDATION_FAILED', 'Product extraction tool input must be an object')
  }
  const payload = input
  const payloadKeys = Object.keys(payload)
  if (payloadKeys.length !== 1 || payloadKeys[0] !== 'items' || !Array.isArray(payload.items)) {
    localizationError(422, 'PRODUCT_IMPORT_VALIDATION_FAILED', 'Product extraction must contain exactly one items array')
  }
  if (payload.items.length === 0) {
    localizationError(422, 'NO_PRODUCTS_EXTRACTED', 'No Products were extracted from the source')
  }
  if (payload.items.length > 100) {
    localizationError(422, 'PRODUCT_IMPORT_VALIDATION_FAILED', 'Product extraction exceeds the 100 item batch limit')
  }
  const errors: Array<{ index: number; fields: string[]; message: string }> = []
  const products: CreateProductInput[] = []
  const duplicateKeys = new Set<string>()
  for (const [index, value] of payload.items.entries()) {
    if (!isRecord(value)) {
      errors.push({ index, fields: [], message: 'item must be an object' })
      continue
    }
    const item = value
    const allowed = ['category', 'name', 'description', 'price', 'price_unreadable', 'details', 'order_url']
    const unknown = Object.keys(item).filter(key => !allowed.includes(key)).sort()
    const missing = allowed.filter(key => !Object.hasOwn(item, key))
    const category = typeof item.category === 'string' ? item.category.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const descriptionValid = item.description === null || typeof item.description === 'string'
    const orderUrlValid = item.order_url === null || typeof item.order_url === 'string'

    const rawPrice = item.price
    let resolvedPrice: CreateProductInput['price'] = null
    let priceValid = rawPrice === null
    if (isRecord(rawPrice)) {
      const priceRecord = rawPrice
      const priceKeys = Object.keys(priceRecord)
      const amountMinor = priceRecord.amount_minor
      priceValid = priceKeys.length === 1
        && priceKeys[0] === 'amount_minor'
        && typeof amountMinor === 'number'
        && Number.isSafeInteger(amountMinor)
        && amountMinor >= 0
      if (priceValid && typeof amountMinor === 'number') resolvedPrice = { amount_minor: amountMinor, currency, unit: 'item', tax_behavior: 'unspecified' }
    }
    const priceUnreadable = item.price_unreadable === true
    if (typeof item.price_unreadable !== 'boolean' || priceUnreadable) priceValid = false
    let details: Product['details'] = []
    let detailsValid = true
    try {
      details = validateProductDetails(item.details)
    } catch {
      detailsValid = false
    }

    const invalidFields = [
      ...unknown,
      ...missing,
      ...(!category ? ['category'] : []),
      ...(!name ? ['name'] : []),
      ...(!priceValid ? ['price'] : []),
      ...(!detailsValid ? ['details'] : []),
      ...(!descriptionValid ? ['description'] : []),
      ...(!orderUrlValid ? ['order_url'] : []),
    ]
    const duplicateKey = `${category.toLocaleLowerCase()}\0${name.toLocaleLowerCase()}`
    if (category && name && duplicateKeys.has(duplicateKey)) invalidFields.push('duplicate')
    duplicateKeys.add(duplicateKey)
    if (invalidFields.length) {
      errors.push({ index, fields: [...new Set(invalidFields)].sort(), message: 'invalid Product candidate' })
      continue
    }
    products.push({
      category,
      name,
      description: typeof item.description === 'string' ? item.description : '',
      price: resolvedPrice,
      order_url: typeof item.order_url === 'string' ? item.order_url : null,
      tags: [],
      details,
      source: 'ai',
    })
  }
  if (errors.length) {
    localizationError(422, 'PRODUCT_IMPORT_VALIDATION_FAILED', 'The complete Product import batch was rejected', { errors })
  }
  return products
}

const IMAGE_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
  'image/avif': 'image/avif',
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/avif') return 'avif'
  if (MARKDOWN_MIME_TYPES.has(mimeType)) return 'md'
  throw new Error(`Unsupported media type: ${mimeType}`)
}

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

export async function saveInboundMediaAsset(
  db: D1Database,
  env: ApiRecord,
  opts: {
    organizationId: string
    siteId: string
    userId: string
    bytes: ArrayBuffer
    mimeType: string
    fileSize: number
    filename?: string
  }
): Promise<MediaAsset> {
  // WhatsApp (and other generic upload paths) frequently report a generic
  // or missing MIME type for plain-text attachments — fall back to the
  // filename extension so a .md/.markdown upload is still recognized.
  const normalizedMimeType = resolveMarkdownMimeType(opts.mimeType, opts.filename) ?? opts.mimeType

  if (MARKDOWN_MIME_TYPES.has(normalizedMimeType)) {
    // Fail fast with a clear error instead of persisting a file the ChowBot
    // analysis pipeline can never actually read.
    assertMarkdownSize(opts.bytes.byteLength)
    decodeMarkdownText(opts.bytes)
  }

  const assetId = crypto.randomUUID()
  const ext = extensionForMime(normalizedMimeType)
  const filename = opts.filename ?? `whatsapp-${assetId}.${ext}`

  if (IMAGE_TYPES[opts.mimeType]) {
    const uploaded = await uploadImageBuffer(env, opts.bytes, filename, IMAGE_TYPES[opts.mimeType])
    await createMediaAsset(db, {
      id: assetId,
      organization_id: opts.organizationId,
      site_id: opts.siteId,
      kind: 'image',
      provider: 'cloudflare_images',
      source: 'uploaded',
      cloudflare_image_id: uploaded.imageId,
      public_url: uploaded.publicUrl,
      thumbnail_url: uploaded.thumbnailUrl,
      mime_type: opts.mimeType,
      file_name: filename,
      file_size: opts.fileSize,
      status: 'active',
      created_by_user_id: opts.userId,
    })
  } else {
    const r2Key = buildR2Key(opts.siteId, assetId, filename)
    const publicUrl = await uploadToR2(env, r2Key, opts.bytes, normalizedMimeType)
    await createMediaAsset(db, {
      id: assetId,
      organization_id: opts.organizationId,
      site_id: opts.siteId,
      kind: 'file',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2_key: r2Key,
      public_url: publicUrl,
      mime_type: normalizedMimeType,
      file_name: filename,
      file_size: opts.fileSize,
      status: 'active',
      created_by_user_id: opts.userId,
    })
  }

  const asset = await getMediaAsset(db, assetId, opts.siteId)
  if (!asset) throw new Error('Failed to save inbound media asset')
  return asset
}

export async function extractProductsFromMediaAsset(
  db: D1Database,
  env: ApiRecord,
  opts: {
    organizationId: string
    siteId: string
    userId: string
    assetId: string
    sessionId?: string | null
    locationId: string
  }
): Promise<{ products: Product[]; creditsRemaining: number }> {
  if (!opts.locationId.trim()) throw new Error('location_id is required when importing Products')

  const asset = await getMediaAsset(db, opts.assetId, opts.siteId)
  if (!asset?.public_url || !asset.mime_type) throw new Error('Media asset not found')

  const mediaResponse = await fetch(asset.public_url, { signal: AbortSignal.timeout(30_000) })
  if (!mediaResponse.ok) throw new Error(`Failed to read media asset: HTTP ${mediaResponse.status}`)
  const bytes = await mediaResponse.arrayBuffer()
  const isPdf = asset.mime_type === 'application/pdf'
  const imageType = IMAGE_TYPES[asset.mime_type]
  if (!isPdf && !imageType) throw new Error(`Unsupported media type: ${asset.mime_type}`)

  const creditOk = await hasCredits(db, opts.organizationId, opts.sessionId)
  if (!creditOk) throw new Error('No AI credits remaining.')
  const site = await queryFirst<{ default_currency: string }>(db, 'SELECT default_currency FROM sites WHERE id = ? AND organization_id = ?', [opts.siteId, opts.organizationId])
  if (!site || !isCurrencyCode(site.default_currency)) throw new Error('Site default currency is unavailable')

  const base64 = base64FromArrayBuffer(bytes)
  const fileContentBlock = isPdf ? documentBlock(base64) : imageBlock(base64, imageType)
  const aiResponse = await callAiGateway(
    env,
    [{ role: 'user', content: [fileContentBlock, textBlock('Extract all Products from this file as JSON.')] }],
    {
      system: extractionSystem(site.default_currency),
      maxTokens: 4096,
      tools: [PRODUCT_EXTRACTION_TOOL],
      toolChoice: { type: 'tool', name: PRODUCT_EXTRACTION_TOOL_NAME },
      metadata: { org_id: opts.organizationId, site_id: opts.siteId, action: 'product_extract' },
    }
  )

  const charged = await chargeCredits(db, opts.organizationId, {
    siteId: opts.siteId,
    sessionId: opts.sessionId,
    action: 'product_extract',
    model: CHOWBOT_MODEL,
    inputTokens: aiResponse.usage.input_tokens,
    outputTokens: aiResponse.usage.output_tokens,
    cfGatewayLogId: aiResponse.cfLogId,
  })

  const toolBlocks = aiResponse.content.filter(block => block.type === 'tool_use')
  if (
    aiResponse.stop_reason !== 'tool_use'
    || aiResponse.content.length !== 1
    || toolBlocks.length !== 1
    || toolBlocks[0]?.name !== PRODUCT_EXTRACTION_TOOL_NAME
  ) {
    localizationError(422, 'PRODUCT_IMPORT_VALIDATION_FAILED', 'Product extraction must return exactly one structured tool call')
  }
  const accepted = parseProductExtraction(toolBlocks[0].input, site.default_currency)
  try {
    const products = await createProductsBatch(db, opts.organizationId, opts.siteId, opts.locationId, accepted, {
      actorId: opts.userId,
      priceProvenance: 'ai-import',
    })
    return { products, creditsRemaining: charged.newBalance }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      localizationError(422, 'PRODUCT_IMPORT_VALIDATION_FAILED', 'The complete Product import batch was rejected', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    throw error
  }
}

const DOCUMENT_ANALYSIS_SYSTEM = `You are a document analysis assistant for a small-business owner's ChowBot assistant. The user has uploaded a Markdown document. You are given its content tagged with structural markers:
- [HEADING level=N] marks a heading.
- [LIST]...[/LIST] marks a bullet or numbered list.
- [TABLE]...[/TABLE] marks a Markdown table.
- [BLOCKQUOTE]...[/BLOCKQUOTE] marks a quoted block.
- [CODE lang=x]...[/CODE] marks a fenced code block.

Answer strictly using the document content provided — do not invent facts not present in it. If the document does not contain enough information to answer, say so plainly. When it helps the user, reference which section/heading an answer came from. If asked to summarize, produce a concise summary that reflects the document's actual structure (key sections, notable lists/tables), not generic filler.`

export interface DocumentAnalysisResult {
  answer: string
  creditsRemaining: number
  stats: ReturnType<typeof parseMarkdownDocument>['stats']
}

/**
 * Analyzes an already-uploaded Markdown media asset for the ChowBot document
 * pipeline: summarization, grounded Q&A, and extraction. Shared by both the
 * MCP `analyze_document` tool (direct asset_id) and ChowBot's WhatsApp
 * pending-media flow (server/utils/chowbot-agent.ts) — same code path, same
 * credit accounting, same AI Gateway call as extractMenuFromMediaAsset above.
 */
export async function analyzeDocumentAsset(
  db: D1Database,
  env: ApiRecord,
  opts: {
    organizationId: string
    siteId: string
    userId: string
    assetId: string
    sessionId?: string | null
    /** Optional question to ground-answer. Defaults to a summary request. */
    question?: string
  }
): Promise<DocumentAnalysisResult> {
  const asset = await getMediaAsset(db, opts.assetId, opts.siteId)
  if (!asset?.public_url || !asset.mime_type) throw new Error('Media asset not found')

  const resolvedMimeType = resolveMarkdownMimeType(asset.mime_type, asset.file_name)
  if (!resolvedMimeType) {
    throw new Error(`Unsupported media type for document analysis: ${asset.mime_type}`)
  }

  const mediaResponse = await fetch(asset.public_url, { signal: AbortSignal.timeout(30_000) })
  if (!mediaResponse.ok) throw new Error(`Failed to read media asset: HTTP ${mediaResponse.status}`)
  const bytes = await mediaResponse.arrayBuffer()

  assertMarkdownSize(bytes.byteLength)
  const text = decodeMarkdownText(bytes)
  const parsed = parseMarkdownDocument(text)

  const creditOk = await hasCredits(db, opts.organizationId, opts.sessionId)
  if (!creditOk) throw new Error('No AI credits remaining.')

  const question = opts.question?.trim() || 'Summarize this document.'
  const aiResponse = await callAiGateway(
    env,
    [{ role: 'user', content: [textBlock(parsed.structuredText), textBlock(question)] }],
    {
      system: DOCUMENT_ANALYSIS_SYSTEM,
      maxTokens: 2048,
      metadata: { org_id: opts.organizationId, site_id: opts.siteId, action: 'document_analysis' },
    }
  )

  const charged = await chargeCredits(db, opts.organizationId, {
    siteId: opts.siteId,
    sessionId: opts.sessionId,
    action: 'document_analysis',
    model: CHOWBOT_MODEL,
    inputTokens: aiResponse.usage.input_tokens,
    outputTokens: aiResponse.usage.output_tokens,
    cfGatewayLogId: aiResponse.cfLogId,
  })

  const answer = aiResponse.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
  if (!answer) throw new Error('The document could not be analyzed — no response was generated.')

  return { answer, creditsRemaining: charged.newBalance, stats: parsed.stats }
}
