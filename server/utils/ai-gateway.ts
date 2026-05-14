// All AI model calls route through Cloudflare AI Gateway — never call Anthropic directly.
// Provider key "default" (Anthropic) is stored in CF; no API key in this code.

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string | ApiRecord[]
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

export interface AiTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: ApiRecord
    required?: string[]
  }
}

export interface AiGatewayOptions {
  model?: string
  maxTokens?: number
  system?: string
  tools?: AiTool[]
  /** Attached to CF Gateway log entry — must include org_id for credit reconciliation */
  metadata?: Record<string, string>
}

export interface AiGatewayResponse {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: ApiValue }>
  stop_reason: string
  usage: {
    input_tokens: number
    output_tokens: number
  }
  /** CF-AIG-Log-Id response header — store for reconciliation */
  cfLogId: string | null
}

export async function callAiGateway(
  env: ApiRecord,
  messages: AiMessage[],
  opts: AiGatewayOptions = {}
): Promise<AiGatewayResponse> {
  const accountId = env.CF_ACCOUNT_ID
  const gatewayName = env.CF_GATEWAY_NAME
  const aigToken = env.CF_AIG_TOKEN

  if (!accountId || !gatewayName || !aigToken) {
    throw new Error('CF AI Gateway env vars not configured (CF_ACCOUNT_ID, CF_GATEWAY_NAME, CF_AIG_TOKEN)')
  }

  const model = opts.model ?? 'claude-sonnet-4-6'
  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/anthropic/v1/messages`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'cf-aig-authorization': `Bearer ${aigToken}`,
    'anthropic-version': '2023-06-01',
  }

  if (opts.metadata && Object.keys(opts.metadata).length > 0) {
    headers['cf-aig-metadata'] = JSON.stringify(opts.metadata)
  }

  const body: ApiRecord = {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    messages,
  }

  if (opts.system) {
    body.system = opts.system
  }

  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools
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

  const data = await response.json() as ApiValue
  const cfLogId = response.headers.get('cf-aig-log-id')

  return {
    content: data.content ?? [],
    stop_reason: data.stop_reason ?? 'end_turn',
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
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg'
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

/** Build a PDF document block (Claude supports PDFs up to 32 MB decoded) */
export function documentBlock(base64Data: string): ApiValue {
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
  }
}
