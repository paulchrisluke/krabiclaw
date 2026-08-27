// POST /api/ai/[siteId]/enhance-prompt
// Rewrites a rough image prompt into a vivid OpenAI image-generation food photography prompt using Claude Haiku.
// body: { prompt: string, context?: string }
import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { hasCredits, chargeCredits } from '~/server/utils/ai-credits'
import { callAiGateway } from '~/server/utils/ai-gateway'
import { requireSiteAccess } from '~/server/utils/location-access'

const ENHANCE_MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM = `You are an expert food and restaurant photography prompt engineer.
Transform the user's rough description into a single vivid image generation prompt.
Rules:
- Professional food photography style: plating, lighting (natural or soft studio), composition, colors, textures, garnishes
- Under 120 words
- Absolutely no text, words, labels, titles, typography, or writing anywhere in the image — pure photography only
- No brand names, no people, no menus, no cards, no signage
- Return ONLY the prompt — no explanation, no quotes, no preamble`

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId)

  const isDev = import.meta.dev

  if (!isDev) {
    const creditOk = await hasCredits(db, site.organization_id, session.session.id)
    if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })
  }

  const body = await readRequiredBody<{ prompt?: unknown; context?: unknown }>(event)
  const rawPrompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 500) : ''
  const context = typeof body?.context === 'string' ? body.context.trim().slice(0, 300) : ''
  if (!rawPrompt) return jsonResponse({ error: 'prompt required' }, { status: 400 })

  const userMessage = context
    ? `Item context: ${context}\n\nRaw prompt: ${rawPrompt}`
    : rawPrompt

  try {
    const response = await callAiGateway(env, [{ role: 'user', content: userMessage }], {
      model: ENHANCE_MODEL, maxTokens: 200, system: SYSTEM, metadata: { org_id: site.organization_id, site_id: siteId, action: 'enhance_prompt' }, })

    const enhanced = response.content.find(b => b.type === 'text')?.text?.trim() ?? rawPrompt

    if (!isDev) {
      try {
        await chargeCredits(db, site.organization_id, {
          siteId, sessionId: session.session.id, action: 'enhance_prompt', model: ENHANCE_MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cfGatewayLogId: response.cfLogId, })
      } catch (err) {
        console.error('enhance_prompt_charge_failed', { siteId, error: err instanceof Error ? err.message : err })
        return jsonResponse({ error: err instanceof Error ? err.message : 'AI usage could not be charged.' }, { status: 402 })
      }
    }

    return jsonResponse({ enhanced })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('enhance_prompt_failed', { siteId, error: msg })
    return jsonResponse({ error: 'Failed to enhance prompt' }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
