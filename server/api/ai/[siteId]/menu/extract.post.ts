// POST /api/ai/[siteId]/menu/extract
// Accepts a photo (JPEG/PNG/WEBP) or PDF page image as multipart form data.
// Passes it to Claude via Cloudflare AI Gateway, extracts menu items as structured JSON,
// and saves them as a draft menu. The owner must publish from the dashboard.
//
// Multipart fields:
//   file        — required, image file (JPEG/PNG/WEBP/GIF) or first page of a PDF rendered to image
//   menuId      — optional, existing draft menu to append to; creates a new one if omitted
//   menuName    — optional, name for a newly created menu (default: "Imported Menu")

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { sendWhatsAppNotification, getOrgWhatsAppPhone } from '~/server/utils/whatsapp'
import { createMenu, createMenuItem } from '~/server/utils/menu-management'
import { callAiGateway, imageBlock, textBlock, documentBlock } from '~/server/utils/ai-gateway'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'

const EXTRACT_SYSTEM = `You are a restaurant menu data extractor. The user will provide a photo or scan of a restaurant menu (including AI-generated food photography with text overlays). Extract ONLY text you can actually see — do not infer or hallucinate dishes.

Return a JSON object with a single key "items" containing an array. Each item must have:
  - section: string (the menu section/category, e.g. "Appetizers", "Mains", "Desserts")
  - name: string (dish name)
  - description: string or null
  - price_amount: string or null (the numeric amount only, without currency symbols or codes, e.g. "120", "12.00")

If you cannot read the menu clearly, return {"items": [], "warning": "reason"}.
Return ONLY valid JSON. No markdown, no explanation.`

const IMAGE_MIME_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
}

// Workers memory cap: base64 inflates ~33%, so 10 MB file → ~13 MB encoded.
// Claude's PDF limit is 32 MB decoded; we stay well under Workers' ~128 MB heap.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024   // 10 MB
const MAX_PDF_BYTES   = 10 * 1024 * 1024   // 10 MB (conservative for Workers)

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify user owns this site
  const site = await db.prepare(`
    SELECT s.id, s.organization_id, o.slug as org_slug
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member om ON o.id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; org_slug: string | null }>()

  if (!site) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  const orgId: string = site.organization_id
  const orgSlug: string = site.org_slug ?? orgId

  // Check credits before doing anything expensive (skipped in local dev)
  const isDev = import.meta.dev
  if (!isDev) {
    const creditOk = await hasCredits(db, orgId)
    if (!creditOk) {
      return jsonResponse(
        { error: 'No AI credits remaining. Upgrade your plan or purchase more credits.' },
        { status: 402 }
      )
    }
  }

  // Parse multipart upload
  let formData: FormData
  try {
    formData = await readFormData(event)
  } catch {
    return jsonResponse({ error: 'Expected multipart/form-data with a file field' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return jsonResponse({ error: 'No file provided' }, { status: 400 })
  }

  const isPdf = file.type?.toLowerCase() === 'application/pdf'
  const mimeType = IMAGE_MIME_TYPES[file.type?.toLowerCase()]

  if (!mimeType && !isPdf) {
    return jsonResponse(
      { error: `Unsupported file type "${file.type}". Upload a JPEG, PNG, WEBP, GIF, or PDF (max 10 MB).` },
      { status: 415 }
    )
  }

  const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (file.size > limit) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(0)
    const tip = isPdf
      ? `Your PDF is ${sizeMb} MB. Please compress it below 10 MB using Smallpdf or ILovePDF, or photograph each menu page and upload the images instead.`
      : `Your image is ${sizeMb} MB. Please resize it below 10 MB.`
    return jsonResponse({ error: tip }, { status: 413 })
  }

  const arrayBuffer = await file.arrayBuffer()
  // Chunked encoding — spreading a large Uint8Array into String.fromCharCode overflows the stack
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  const base64 = btoa(binary)

  const fileContentBlock = isPdf
    ? documentBlock(base64)
    : imageBlock(base64, mimeType!)

  // Call Claude via CF AI Gateway
  let aiResponse
  try {
    aiResponse = await callAiGateway(
      env,
      [
        {
          role: 'user',
          content: [
            fileContentBlock,
            textBlock('Extract all menu items from this file as JSON.'),
          ],
        },
      ],
      {
        system: EXTRACT_SYSTEM,
        maxTokens: 4096,
        metadata: { org_id: orgId, site_id: siteId, action: 'menu_extract' },
      }
    )
  } catch (err) {
    console.error('AI Gateway error:', err)
    return jsonResponse({ error: 'AI extraction failed. Please try again.' }, { status: 502 })
  }

  // Charge credits after successful call
  let creditsCharged = 0
  let newBalance = 0
  try {
    const charged = await chargeCredits(db, orgId, {
      siteId,
      action: 'menu_extract',
      model: 'claude-sonnet-4-6',
      inputTokens: aiResponse.usage.input_tokens,
      outputTokens: aiResponse.usage.output_tokens,
      cfGatewayLogId: aiResponse.cfLogId,
    })
    creditsCharged = charged.creditsCharged
    newBalance = charged.newBalance
  } catch (err) {
    console.error('Failed to charge credits for menu extraction:', err)
  }

  // Parse model response — strip markdown fences Claude sometimes adds
  const rawText = aiResponse.content.find((b) => b.type === 'text')?.text ?? ''
  const jsonText = (() => {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) return (fenced[1] ?? '').trim()
    const obj = rawText.match(/\{[\s\S]*\}/)
    if (obj) return obj[0]
    return rawText.trim()
  })()
  let parsed: { items: ApiRecord[]; warning?: string }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    console.error('[menu/extract] unparseable response:', rawText.slice(0, 300))
    return jsonResponse(
      { error: 'Could not read menu from that file. Try a higher-resolution photo or a less complex layout.' },
      { status: 422 }
    )
  }

  const extractedItems: ApiRecord[] = Array.isArray(parsed.items) ? parsed.items : []

  // Filter out invalid items before processing
  const validItems = extractedItems.filter((item) => {
    if (!item || typeof item !== 'object') return false
    if (!item.name || typeof item.name !== 'string' || !item.name.trim()) return false
    return true
  })

  if (validItems.length === 0) {
    return jsonResponse({
      success: true,
      menuItems: [],
      warning: parsed.warning ?? 'No items detected in the image.',
      credits: { charged: creditsCharged, remaining: newBalance },
    })
  }

  // Resolve or create a draft menu
  let menuId = formData.get('menuId') as string | null
  if (menuId) {
    const existing = await db.prepare(
      'SELECT id FROM menus WHERE id = ? AND organization_id = ? AND site_id = ? AND status = ? LIMIT 1'
    ).bind(menuId, orgId, siteId, 'draft').first()
    if (!existing) menuId = null
  }

  if (!menuId) {
    const menuName = (formData.get('menuName') as string | null)?.trim() || 'Imported Menu'
    const newMenu = await createMenu(db, orgId, siteId, { name: menuName }, session.user.id)
    menuId = newMenu.id
  }

  // Write items to draft menu (created_by marks them as AI-sourced)
  const createdItems = await Promise.all(
    validItems.map((item: ApiValue) => {
      const priceAmount = item.price_amount ?? item.price
      return createMenuItem(
        db,
        orgId,
        siteId!,
        menuId!,
        {
          section: String(item.section || 'Menu').slice(0, 100),
          name: String(item.name || '').slice(0, 200),
          description: item.description ? String(item.description).slice(0, 500) : undefined,
          price_amount: priceAmount ? String(priceAmount).slice(0, 50) : undefined,
        },
        `ai:${session.user.id}`
      )
    })
  )

  // Fire WhatsApp notifications — non-blocking
  getOrgWhatsAppPhone(db, orgId, siteId).then((phone) => {
    if (!phone) return
    // Notify: AI extraction complete
    sendWhatsAppNotification(env, db, {
      organizationId: orgId,
      siteId,
      toPhone: phone,
      template: 'ai_action_complete',
      vars: {
        action_summary: `${createdItems.length} menu item${createdItems.length === 1 ? '' : 's'} extracted and saved as draft`,
        preview_url: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN ?? 'https://krabiclaw.com'}/dashboard/${orgSlug}/menu`,
      },
    }).catch(console.error)

    // Notify: low credits warning (threshold: 50)
    if (newBalance > 0 && newBalance <= 50) {
      sendWhatsAppNotification(env, db, {
        organizationId: orgId,
        siteId,
        toPhone: phone,
        template: 'low_credits',
        vars: {
          credits_remaining: String(newBalance),
          upgrade_url: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN ?? 'https://krabiclaw.com'}/dashboard/${orgSlug}/settings/billing`,
        },
      }).catch(console.error)
    }
  }).catch(console.error)

  return jsonResponse({
    success: true,
    menuId,
    menuItems: createdItems,
    warning: parsed.warning ?? null,
    credits: { charged: creditsCharged, remaining: newBalance },
  }, { status: 201 })
})
