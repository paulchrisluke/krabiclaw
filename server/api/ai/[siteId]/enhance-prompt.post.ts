// POST /api/ai/[siteId]/enhance-prompt
// Rewrites a rough image prompt into a vivid OpenAI image-generation food photography prompt using Claude Haiku.
// body: { prompt: string, context?: string }
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { callAiGateway } from '~/server/utils/ai-gateway'
import { queryFirst } from '~/server/db'

const ENHANCE_MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM = `You are an expert food and restaurant photography prompt engineer.
Transform the user's rough description into a single vivid image generation prompt.
Rules:
- Professional food photography style: plating, lighting (natural or soft studio), composition, colors, textures, garnishes
- Under 120 words
- Absolutely no text, words, labels, titles, typography, or writing anywhere in the image — pure photography only
- No brand names, no people, no menus, no cards, no signage
- Return ONLY the prompt — no explanation, no quotes, no preamble`

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ organization_id: string }>(db, `
    SELECT s.organization_id FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const isDev = import.meta.dev

  if (!isDev) {
    const creditOk = await hasCredits(db, site.organization_id)
    if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })
  }

  const body = await readBody(event)
  const rawPrompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 500) : ''
  const context = typeof body?.context === 'string' ? body.context.trim().slice(0, 300) : ''
  if (!rawPrompt) return jsonResponse({ error: 'prompt required' }, { status: 400 })

  const userMessage = context
    ? `Item context: ${context}\n\nRaw prompt: ${rawPrompt}`
    : rawPrompt

  try {
    const response = await callAiGateway(env, [{ role: 'user', content: userMessage }], {
      model: ENHANCE_MODEL,
      maxTokens: 200,
      system: SYSTEM,
      metadata: { org_id: site.organization_id, site_id: siteId, action: 'enhance_prompt' },
    })

    const enhanced = response.content.find(b => b.type === 'text')?.text?.trim() ?? rawPrompt

    if (!isDev) {
      try {
        await chargeCredits(db, site.organization_id, {
          siteId,
          action: 'enhance_prompt',
          model: ENHANCE_MODEL,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cfGatewayLogId: response.cfLogId,
        })
      } catch (err) {
        console.error('enhance_prompt_charge_failed', { siteId, error: err instanceof Error ? err.message : err })
      }
    }

    return jsonResponse({ enhanced })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('enhance_prompt_failed', { siteId, error: msg })
    return jsonResponse({ error: 'Failed to enhance prompt' }, { status: 500 })
  }
})
