const PUBLIC_HELP_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const AI_TIMEOUT_MS = 30000

interface WorkersAiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface WorkersAiResponse {
  response?: string
}

export async function runWorkersAiText(
  env: ApiRecord,
  messages: WorkersAiMessage[],
  options: {
    maxTokens?: number
    temperature?: number
  } = {},
) {
  const ai = env.AI as { run: (_model: string, _input: ApiRecord) => Promise<WorkersAiResponse> } | undefined
  if (!ai?.run) {
    throw new Error('Workers AI binding is not available')
  }

  const result = await Promise.race([
    ai.run(PUBLIC_HELP_MODEL, {
      messages,
      max_tokens: options.maxTokens ?? 700,
      temperature: options.temperature ?? 0.2,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Workers AI request timed out')), AI_TIMEOUT_MS)
    ),
  ])

  return result.response?.trim() ?? ''
}
