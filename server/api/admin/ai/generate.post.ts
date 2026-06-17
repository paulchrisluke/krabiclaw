// POST /api/admin/ai/generate - ChowBot for platform content
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { callAiGateway } from '~/server/utils/ai-gateway'

const MAX_PROMPT_LENGTH = 5000

const SYSTEM = `You are a helpful AI assistant for KrabiClaw, a restaurant website builder platform.
Help generate content for the KrabiClaw platform website, including blog posts, help articles, and marketing copy.
Keep responses concise, professional, and friendly.`

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  let body: { prompt?: string }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) return jsonResponse({ error: 'prompt is required' }, { status: 400 })
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return jsonResponse({ error: `prompt exceeds maximum length (${MAX_PROMPT_LENGTH})` }, { status: 413 })
  }

  try {
    const aiResponse = await callAiGateway(env, [
      { role: 'user', content: prompt }
    ], {
      system: SYSTEM,
      maxTokens: 2048,
      metadata: { action: 'platform_content_generation' },
    })

    const contentBlock = aiResponse.content.find((b: ApiValue) => b.type === 'text')
    const content = contentBlock?.text || ''
    
    return jsonResponse({ success: true, content })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('AI generation failed', {
      userId: session.user.id,
      promptLength: prompt.length,
      error: error.message,
      stack: error.stack
    })
    return jsonResponse({ error: 'AI generation failed. Please try again.' }, { status: 502 })
  }
})
