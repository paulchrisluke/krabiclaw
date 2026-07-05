import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { formatPublicSearchResultsForPrompt, searchPublicResources } from '~/server/utils/public-search'
import { runWorkersAiText } from '~/server/utils/workers-ai'

interface HelpMessage {
  role?: 'user' | 'assistant'
  content?: string
}

function parseAgentEnvelope(raw: string) {
  const escalateMatch = raw.match(/ESCALATE:\s*(yes|no)/i)
  const topicMatch = raw.match(/TOPIC:\s*(.+)/i)
  const summaryMatch = raw.match(/SUMMARY:\s*(.+)/i)
  const answerMatch = raw.match(/ANSWER:\s*([\s\S]*)$/i)

  return {
    escalate: escalateMatch?.[1]?.toLowerCase() === 'yes',
    topic: topicMatch?.[1]?.trim() || null,
    summary: summaryMatch?.[1]?.trim() || null,
    answer: answerMatch?.[1]?.trim() || raw.trim(),
  }
}

function shouldForceEscalation(message: string) {
  return /\b(human|contact|support case|refund|billing issue|bug|broken|can't access|cannot access|login problem|urgent)\b/i.test(message)
}

function buildFallbackReply(message: string, results: Array<{ title: string; path: string; snippet: string }>) {
  if (!results.length) {
    return `I couldn't find a confident public answer for "${message}" in the current docs or blog.\n\nIf you want, send the details to support and the team can follow up by email.`
  }

  const lines = results.slice(0, 3).map(result =>
    `- [${result.title}](${result.path}) — ${result.snippet}`,
  )
  return [
    'Here are the most relevant public resources I found:',
    '',
    ...lines,
    '',
    'If these do not solve it, send the details to support and we will follow up by email.',
  ].join('\n')
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  let body: { message?: string; history?: HelpMessage[]; topic?: string | null }
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  const history = Array.isArray(body.history)
    ? body.history
        .filter(item => item && typeof item.content === 'string' && (item.role === 'user' || item.role === 'assistant'))
        .slice(-6)
        .map(item => ({ role: item.role!, content: item.content!.trim().slice(0, 2000) }))
    : []

  if (!message) {
    return jsonResponse({ error: 'message is required' }, { status: 400 })
  }

  try {
    const results = await searchPublicResources(db, `${topic ? `${topic} ` : ''}${message}`, { limit: 6 })
    const promptResults = formatPublicSearchResultsForPrompt(results)
    let parsed = {
      escalate: results.length === 0,
      topic: topic || null,
      summary: null as string | null,
      answer: buildFallbackReply(message, results),
    }

    try {
      const aiOutput = await runWorkersAiText(env, [
        {
          role: 'system',
          content: [
            'You are KrabiClaw Support, a concise public support assistant.',
            'Only answer using the provided search results.',
            'If the search results are insufficient, the question needs account-specific help, or the user appears blocked, escalate to a support form.',
            'Return exactly this format:',
            'ESCALATE: yes|no',
            'TOPIC: <short topic>',
            'SUMMARY: <one sentence support summary or none>',
            'ANSWER:',
            '<markdown answer>',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            topic ? `Selected topic: ${topic}` : 'Selected topic: none',
            history.length ? `Recent conversation:\n${history.map(item => `${item.role}: ${item.content}`).join('\n')}` : 'Recent conversation: none',
            `User question: ${message}`,
            `Search results:\n${promptResults || 'No relevant results found.'}`,
          ].join('\n\n'),
        },
      ], { maxTokens: 700, temperature: 0.2 })

      parsed = parseAgentEnvelope(aiOutput)
    } catch (error) {
      console.warn('Public help agent falling back to deterministic search response:', error)
    }

    const shouldEscalate = parsed.escalate || results.length === 0 || shouldForceEscalation(message)
    const suggestedLinks = results
      .filter(result => result.path !== '/help')
      .slice(0, 3)
      .map(result => ({ title: result.title, path: result.path, type: result.type }))

    return jsonResponse({
      reply: parsed.answer,
      citations: results.slice(0, 3),
      suggestedLinks,
      escalation: shouldEscalate
        ? {
            topic: parsed.topic || topic || 'Support request',
            message: parsed.summary && parsed.summary.toLowerCase() !== 'none'
              ? `${parsed.summary}\n\n${message}`
              : message,
            suggested_summary: parsed.summary && parsed.summary.toLowerCase() !== 'none'
              ? parsed.summary
              : null,
            agent_metadata_json: {
              topic: topic || null,
              results: results.slice(0, 5),
            },
          }
        : null,
    })
  } catch (error) {
    console.error('Public help agent failed:', error)
    return jsonResponse({ error: 'Failed to answer support question' }, { status: 500 })
  }
})
