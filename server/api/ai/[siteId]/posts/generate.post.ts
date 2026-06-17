// POST /api/ai/[siteId]/posts/generate
// Accepts a text prompt and optional base64 image.
// Calls Claude via CF AI Gateway and returns a draft post (title + body).
// Does NOT save — the client saves via POST /api/editor/sites/[siteId]/posts.

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { callAiGateway, imageBlock, textBlock } from '~/server/utils/ai-gateway'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'

const SYSTEM = `You are a social media and restaurant marketing assistant. Given a prompt (and optionally a photo), write a short, engaging post for a restaurant website.

Return a JSON object with exactly two keys:
  - "title": a short punchy headline (max 80 characters), or null if the post works without one
  - "body": the post body (max 400 characters). Friendly, warm tone. Mention the restaurant context. No hashtags unless asked.

Return ONLY valid JSON. No markdown, no explanation.`

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id, s.brand_name FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; brand_name: string | null }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const orgId: string = site.organization_id

  const creditOk = await hasCredits(db, orgId)
  if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })

  let body: { prompt?: string; image_base64?: string; image_mime?: string }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) return jsonResponse({ error: 'prompt is required' }, { status: 400 })

  const restaurantName = (site.brand_name as string | null) ?? 'the restaurant'
  const userContent: ApiRecord[] = []

  if (body.image_base64 && body.image_mime) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (allowed.includes(body.image_mime)) {
      userContent.push(imageBlock(body.image_base64, body.image_mime as ApiValue))
    }
  }

  userContent.push(textBlock(
    `Restaurant: ${restaurantName}\nRequest: ${prompt}`
  ))

  let aiResponse
  try {
    aiResponse = await callAiGateway(env, [{ role: 'user', content: userContent }], {
      system: SYSTEM,
      maxTokens: 512,
      metadata: { org_id: orgId, site_id: siteId, action: 'post_generate' },
    })
  } catch {
    return jsonResponse({ error: 'AI generation failed. Please try again.' }, { status: 502 })
  }

  const { creditsCharged, newBalance } = await chargeCredits(db, orgId, {
    siteId,
    action: 'post_generate',
    model: 'claude-sonnet-4-6',
    inputTokens: aiResponse.usage.input_tokens,
    outputTokens: aiResponse.usage.output_tokens,
    cfGatewayLogId: aiResponse.cfLogId,
  })

  const rawText = aiResponse.content.find((b: ApiValue) => b.type === 'text')?.text ?? ''
  let parsed: { title: string | null; body: string }
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return jsonResponse({ error: 'AI returned unexpected format. Try rephrasing your prompt.' }, { status: 422 })
  }

  return jsonResponse({
    success: true,
    draft: { title: parsed.title ?? null, body: parsed.body ?? '' },
    credits: { charged: creditsCharged, remaining: newBalance },
  })
})
