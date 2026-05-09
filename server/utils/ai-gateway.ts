// All AI model calls route through Cloudflare AI Gateway — never call Anthropic directly.
// Provider key "default" (Anthropic) is stored in CF; no API key in this code.

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string | AiContentBlock[]
}

export interface AiContentBlock {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64'
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }
}

export interface AiGatewayOptions {
  model?: string
  maxTokens?: number
  system?: string
  /** Attached to CF Gateway log entry — must include org_id for credit reconciliation */
  metadata?: Record<string, string>
}

export interface AiGatewayResponse {
  content: Array<{ type: string; text: string }>
  usage: {
    input_tokens: number
    output_tokens: number
  }
  /** CF-AIG-Log-Id response header — store for reconciliation */
  cfLogId: string | null
}

export async function callAiGateway(
  env: Record<string, any>,
  messages: AiMessage[],
  opts: AiGatewayOptions = {}
): Promise<AiGatewayResponse> {
  const accountId = env.CF_ACCOUNT_ID
  const gatewayName = env.CF_GATEWAY_NAME
  const aigToken = env.CF_AIG_TOKEN

  if (!accountId || !gatewayName || !aigToken) {
    throw new Error('CF AI Gateway env vars not configured (CF_ACCOUNT_ID, CF_GATEWAY_NAME, CF_AIG_TOKEN)')
  }

  const model = opts.model ?? 'claude-sonnet-4-6-20250219'
  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/anthropic/v1/messages`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'cf-aig-authorization': `Bearer ${aigToken}`,
    'anthropic-version': '2023-06-01',
  }

  if (opts.metadata && Object.keys(opts.metadata).length > 0) {
    headers['cf-aig-metadata'] = JSON.stringify(opts.metadata)
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    messages,
  }

  if (opts.system) {
    body.system = opts.system
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI Gateway error ${response.status}: ${errorText}`)
  }

  const data = await response.json() as any
  const cfLogId = response.headers.get('cf-aig-log-id')

  return {
    content: data.content ?? [],
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
    },
    cfLogId,
  }
}

/** Build a vision content block from a base64-encoded image */
export function imageBlock(
  base64Data: string,
  mediaType: AiContentBlock['source']['media_type'] = 'image/jpeg'
): AiContentBlock {
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: base64Data },
  }
}

/** Build a text content block */
export function textBlock(text: string): AiContentBlock {
  return { type: 'text', text }
}
