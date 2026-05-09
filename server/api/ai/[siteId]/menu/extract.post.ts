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
import { callAiGateway, imageBlock, textBlock } from '~/server/utils/ai-gateway'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'

const EXTRACT_SYSTEM = `You are a restaurant menu data extractor. The user will provide a photo or scan of a restaurant menu (including AI-generated food photography with text overlays). Extract ONLY text you can actually see — do not infer or hallucinate dishes.

Return a JSON object with a single key "items" containing an array. Each item must have:
  - section: string (the menu section/category, e.g. "Appetizers", "Mains", "Desserts")
  - name: string (dish name)
  - description: string or null
  - price: string or null (keep original formatting, e.g. "฿120", "120 THB", "$12.00")

If you cannot read the menu clearly, return {"items": [], "warning": "reason"}.
Return ONLY valid JSON. No markdown, no explanation.`

const IMAGE_MIME_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify user owns this site
  const site = await db.prepare(`
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member om ON o.id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first()

  if (!site) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  const orgId: string = site.organization_id

  // Check credits before doing anything expensive
  const creditOk = await hasCredits(db, orgId)
  if (!creditOk) {
    return jsonResponse(
      { error: 'No AI credits remaining. Upgrade your plan or purchase more credits.' },
      { status: 402 }
    )
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

  const mimeType = IMAGE_MIME_TYPES[file.type?.toLowerCase()]
  if (!mimeType) {
    return jsonResponse(
      { error: `Unsupported file type "${file.type}". Upload a JPEG, PNG, WEBP, or GIF image.` },
      { status: 415 }
    )
  }

  // 10 MB limit — base64 inflates ~33%, Claude's image limit is ~5MB decoded
  if (file.size > 10 * 1024 * 1024) {
    return jsonResponse({ error: 'File too large. Maximum 10 MB.' }, { status: 413 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

  // Call Claude via CF AI Gateway
  let aiResponse
  try {
    aiResponse = await callAiGateway(
      env,
      [
        {
          role: 'user',
          content: [
            imageBlock(base64, mimeType),
            textBlock('Extract all menu items from this image as JSON.'),
          ],
        },
      ],
      {
        system: EXTRACT_SYSTEM,
        maxTokens: 4096,
        metadata: { org_id: orgId, site_id: siteId, action: 'menu_extract' },
      }
    )
  } catch (err: any) {
    console.error('AI Gateway error:', err)
    return jsonResponse({ error: 'AI extraction failed. Please try again.' }, { status: 502 })
  }

  // Charge credits after successful call
  const { creditsCharged, newBalance } = await chargeCredits(db, orgId, {
    siteId,
    action: 'menu_extract',
    model: 'claude-sonnet-4-6-20250219',
    inputTokens: aiResponse.usage.input_tokens,
    outputTokens: aiResponse.usage.output_tokens,
    cfGatewayLogId: aiResponse.cfLogId,
  })

  // Parse model response
  const rawText = aiResponse.content.find((b) => b.type === 'text')?.text ?? ''
  let parsed: { items: any[]; warning?: string }
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return jsonResponse(
      { error: 'Model returned malformed JSON. Try a clearer image.' },
      { status: 422 }
    )
  }

  const extractedItems: any[] = Array.isArray(parsed.items) ? parsed.items : []

  if (extractedItems.length === 0) {
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
      'SELECT id FROM menus WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1'
    ).bind(menuId, orgId, siteId).first()
    if (!existing) menuId = null
  }

  if (!menuId) {
    const menuName = (formData.get('menuName') as string | null)?.trim() || 'Imported Menu'
    const newMenu = await createMenu(db, orgId, siteId, { name: menuName }, session.user.id)
    menuId = newMenu.id
  }

  // Write items to draft menu (created_by marks them as AI-sourced)
  const createdItems = await Promise.all(
    extractedItems.map((item: any) =>
      createMenuItem(
        db,
        menuId!,
        {
          section: String(item.section || 'Menu').slice(0, 100),
          name: String(item.name || '').slice(0, 200),
          description: item.description ? String(item.description).slice(0, 500) : null,
          price: item.price ? String(item.price).slice(0, 50) : null,
        },
        `ai:${session.user.id}`
      )
    )
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
        preview_url: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN ?? 'https://krabiclaw.com'}/dashboard/sites/${siteId}/menu`,
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
          upgrade_url: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN ?? 'https://krabiclaw.com'}/dashboard/billing`,
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
