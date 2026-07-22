// POST /api/ai/[siteId]/posts/generate
// Accepts a text prompt and optional base64 image.
// Calls Claude via CF AI Gateway and returns generated post content (title + body).
// Does NOT save — the client saves via POST /api/editor/sites/[siteId]/posts.

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { callAiGateway, imageBlock, textBlock } from '~/server/utils/ai-gateway'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'

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

  const site = await queryFirst<{ id: string; organization_id: string; brand_name: string | null; member_id: string; member_role: string }>(db, `
    SELECT s.id, s.organization_id, s.brand_name, m.id AS member_id, m.role AS member_role FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  await assertSiteWideAccess(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId })

  const orgId: string = site.organization_id

  const isDev = import.meta.dev
  if (!isDev) {
    const creditOk = await hasCredits(db, orgId)
    if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })
  }

  let body: { prompt?: string; image_base64?: string; image_mime?: string }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.prompt !== undefined && typeof body.prompt !== 'string') {
    return jsonResponse({ error: 'prompt must be a string' }, { status: 400 })
  }

  if (body.image_base64 !== undefined && typeof body.image_base64 !== 'string') {
    return jsonResponse({ error: 'image_base64 must be a string' }, { status: 400 })
  }

  if (body.image_mime !== undefined && typeof body.image_mime !== 'string') {
    return jsonResponse({ error: 'image_mime must be a string' }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) return jsonResponse({ error: 'prompt is required' }, { status: 400 })

  const restaurantName = (site.brand_name as string | null) ?? 'the restaurant'
  const userContent: ApiRecord[] = []

  if (body.image_base64 && body.image_mime) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(body.image_mime)) {
      return jsonResponse({ error: `Unsupported image MIME type: ${body.image_mime}. Allowed types: ${allowed.join(', ')}` }, { status: 400 })
    }
    const base64Length = body.image_base64.length
    const maxBase64Size = 5 * 1024 * 1024 * 4 / 3 // 5MB decoded, accounting for base64 overhead
    if (base64Length > maxBase64Size) {
      return jsonResponse({ error: 'Image size exceeds 5MB limit. Please use a smaller image.' }, { status: 413 })
    }
    userContent.push(imageBlock(body.image_base64, body.image_mime as ApiValue))
  } else if (body.image_base64 || body.image_mime) {
    return jsonResponse({ error: 'Both image_base64 and image_mime must be provided together' }, { status: 400 })
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

  let creditsCharged = 0
  let newBalance = 0
  try {
    const charged = await chargeCredits(db, orgId, {
      siteId,
      action: 'post_generate',
      model: 'claude-sonnet-4-6',
      inputTokens: aiResponse.usage.input_tokens,
      outputTokens: aiResponse.usage.output_tokens,
      cfGatewayLogId: aiResponse.cfLogId,
    })
    creditsCharged = charged.creditsCharged
    newBalance = charged.newBalance
  } catch (err) {
    console.error('Failed to charge credits for post generation:', err)
  }

  const rawText = aiResponse.content.find((b: ApiValue) => b.type === 'text')?.text ?? ''
  // Extract JSON from fenced code blocks or find JSON object pattern
  const jsonText = (() => {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) return (fenced[1] ?? '').trim()
    const obj = rawText.match(/\{[\s\S]*\}/)
    if (obj) return obj[0]
    return rawText.trim()
  })()
  let parsed: { title: string | null; body: string }
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return jsonResponse({ error: 'AI returned unexpected format. Try rephrasing your prompt.' }, { status: 422 })
  }
  // Validate parsed structure
  if (!parsed || typeof parsed !== 'object') {
    return jsonResponse({ error: 'AI returned invalid format. Expected an object with title and body.' }, { status: 422 })
  }
  if (typeof parsed.body !== 'string') {
    return jsonResponse({ error: 'AI returned invalid format. Body must be a string.' }, { status: 422 })
  }
  if (parsed.title !== null && parsed.title !== undefined && typeof parsed.title !== 'string') {
    return jsonResponse({ error: 'AI returned invalid format. Title must be a string or null.' }, { status: 422 })
  }

  return jsonResponse({
    success: true,
    generated: { title: parsed.title ?? null, body: parsed.body ?? '' },
    credits: { charged: creditsCharged, remaining: newBalance },
  })
})
