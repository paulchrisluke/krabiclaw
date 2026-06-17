import { callAiGateway, documentBlock, imageBlock, textBlock } from '~/server/utils/ai-gateway'
import { chargeCredits, hasCredits } from '~/server/utils/ai-credits'
import { createMenu, createMenuItem, deleteMenu } from '~/server/utils/menu-management'
import { uploadImageBuffer } from '~/server/utils/cloudflare-images'
import { buildR2Key, uploadToR2 } from '~/server/utils/cloudflare-r2'
import { createMediaAsset, getMediaAsset, type MediaAsset } from '~/server/utils/media-asset-manager'
import { CHOWBOT_MODEL } from '~/server/utils/ai-models'

const EXTRACT_SYSTEM = `You are a restaurant menu data extractor. The user will provide a photo or scan of a restaurant menu. Extract ONLY text you can actually see — do not infer or hallucinate dishes.

Return a JSON object with a single key "items" containing an array. Each item must have:
  - section: string
  - name: string
  - description: string or null
  - price_amount: string or null (numeric amount only, without currency symbols or codes)

If you cannot read the menu clearly, return {"items": [], "warning": "reason"}.
Return ONLY valid JSON. No markdown, no explanation.`

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
  const assetId = crypto.randomUUID()
  const ext = extensionForMime(opts.mimeType)
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
    const publicUrl = await uploadToR2(env, r2Key, opts.bytes, opts.mimeType)
    await createMediaAsset(db, {
      id: assetId,
      organization_id: opts.organizationId,
      site_id: opts.siteId,
      kind: 'file',
      provider: 'cloudflare_r2',
      source: 'uploaded',
      r2_key: r2Key,
      public_url: publicUrl,
      mime_type: opts.mimeType,
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

export async function extractMenuFromMediaAsset(
  db: D1Database,
  env: ApiRecord,
  opts: {
    organizationId: string
    siteId: string
    userId: string
    assetId: string
    menuName?: string
  }
): Promise<{ menuId: string | null; count: number; warning: string | null; creditsRemaining: number }> {
  const asset = await getMediaAsset(db, opts.assetId, opts.siteId)
  if (!asset?.public_url || !asset.mime_type) throw new Error('Media asset not found')

  const mediaResponse = await fetch(asset.public_url)
  if (!mediaResponse.ok) throw new Error(`Failed to read media asset: HTTP ${mediaResponse.status}`)
  const bytes = await mediaResponse.arrayBuffer()
  const isPdf = asset.mime_type === 'application/pdf'
  const imageType = IMAGE_TYPES[asset.mime_type]
  if (!isPdf && !imageType) throw new Error(`Unsupported media type: ${asset.mime_type}`)

  const creditOk = await hasCredits(db, opts.organizationId)
  if (!creditOk) throw new Error('No AI credits remaining.')

  const base64 = base64FromArrayBuffer(bytes)
  const fileContentBlock = isPdf ? documentBlock(base64) : imageBlock(base64, imageType)
  const aiResponse = await callAiGateway(
    env,
    [{ role: 'user', content: [fileContentBlock, textBlock('Extract all menu items from this file as JSON.')] }],
    {
      system: EXTRACT_SYSTEM,
      maxTokens: 4096,
      metadata: { org_id: opts.organizationId, site_id: opts.siteId, action: 'menu_extract' },
    }
  )

  const charged = await chargeCredits(db, opts.organizationId, {
    siteId: opts.siteId,
    action: 'menu_extract',
    model: CHOWBOT_MODEL,
    inputTokens: aiResponse.usage.input_tokens,
    outputTokens: aiResponse.usage.output_tokens,
    cfGatewayLogId: aiResponse.cfLogId,
  })

  const rawText = aiResponse.content.find((b) => b.type === 'text')?.text ?? ''
  const jsonText = (() => {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) return (fenced[1] ?? '').trim()
    const firstBrace = rawText.indexOf('{')
    const lastBrace = rawText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      return rawText.slice(firstBrace, lastBrace + 1)
    }
    return rawText.trim()
  })()
  let parsed: { items: ApiRecord[]; warning?: string }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Could not read menu from that file. Try a higher-resolution photo or a less complex layout.')
  }

  const extractedItems = Array.isArray(parsed.items) ? parsed.items : []
  if (!extractedItems.length) {
    return { menuId: null, count: 0, warning: parsed.warning ?? 'No items detected in the image.', creditsRemaining: charged.newBalance }
  }

  const menu = await createMenu(db, opts.organizationId, opts.siteId, { name: opts.menuName ?? 'Imported Menu' }, opts.userId)
  const createdItems: string[] = []
  try {
    for (const item of extractedItems as ApiValue[]) {
      const priceAmount = item.price_amount ?? item.price
      const created = await createMenuItem(
        db,
        opts.organizationId,
        opts.siteId,
        menu.id,
        {
          section: String(item.section || 'Menu').slice(0, 100),
          name: String(item.name || '').slice(0, 200),
          description: item.description ? String(item.description).slice(0, 500) : undefined,
          price_amount: priceAmount !== null && priceAmount !== undefined ? String(priceAmount).slice(0, 50) : undefined,
        },
        `ai:${opts.userId}`
      )
      createdItems.push(created.id)
    }
  } catch (error) {
    try {
      await deleteMenu(db, opts.organizationId, opts.siteId, menu.id)
    } catch (cleanupError) {
      console.error('Failed to clean up partial menu import:', cleanupError)
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Menu import failed after creating ${createdItems.length} item${createdItems.length === 1 ? '' : 's'}; draft menu was removed. ${reason}`)
  }

  return { menuId: menu.id, count: createdItems.length, warning: parsed.warning ?? null, creditsRemaining: charged.newBalance }
}
