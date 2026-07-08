import { setResponseHeader, type H3Event } from 'h3'
import { purgeSiteKvCache } from '~/server/utils/edge-cache'

export function quoteChallengeValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function buildMcpOAuthChallenge(options: {
  resourceMetadataUrl: string
  error?: 'invalid_token' | 'insufficient_scope'
  description: string
  scope?: string
}) {
  const { resourceMetadataUrl, error = 'invalid_token', description, scope } = options
  return [
    `Bearer resource_metadata="${quoteChallengeValue(resourceMetadataUrl)}"`,
    `error="${quoteChallengeValue(error)}"`,
    `error_description="${quoteChallengeValue(description)}"`,
    ...(scope ? [`scope="${quoteChallengeValue(scope)}"`] : []),
  ].join(', ')
}

export function setMcpAuthChallenge(event: H3Event, challenge: string) {
  setResponseHeader(event, 'WWW-Authenticate', challenge)
}

export function mcpAuthRequiredResult(options: { challenge: string; message: string }) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: options.message,
      },
    ],
    _meta: {
      'mcp/www_authenticate': [options.challenge],
    },
  }
}

const TOKEN_MISSING_DESCRIPTION = 'Token missing, expired, invalid, or not issued for this MCP resource'

export function mcpAuthChallengeDetailsFromError(error: unknown): {
  error: 'invalid_token' | 'insufficient_scope'
  description: string
  scope?: string
} | null {
  const data = error && typeof error === 'object' && 'data' in error
    ? (error as { data?: unknown }).data
    : null
  const auth = data && typeof data === 'object' && 'mcpAuth' in data
    ? (data as { mcpAuth?: unknown }).mcpAuth
    : null
  if (!auth || typeof auth !== 'object') return null
  const details = auth as { error?: unknown; description?: unknown; scope?: unknown }
  return {
    error: details.error === 'insufficient_scope' ? 'insufficient_scope' : 'invalid_token',
    description: typeof details.description === 'string' ? details.description : TOKEN_MISSING_DESCRIPTION,
    scope: typeof details.scope === 'string' ? details.scope : undefined,
  }
}

export function buildMcpAuthChallengeForError(
  error: unknown,
  options: { resourceMetadataUrl: string; defaultDescription: string },
) {
  const details = mcpAuthChallengeDetailsFromError(error)
  if (!details) {
    return buildMcpOAuthChallenge({
      resourceMetadataUrl: options.resourceMetadataUrl,
      description: options.defaultDescription,
    })
  }
  return buildMcpOAuthChallenge({
    resourceMetadataUrl: options.resourceMetadataUrl,
    error: details.error,
    description: details.description,
    scope: details.scope,
  })
}

export function describeMcpAuthTelemetryError(
  error: unknown,
  options?: { fallback?: string; prefix?: string },
) {
  const details = mcpAuthChallengeDetailsFromError(error)
  const prefix = options?.prefix ?? 'credential_rejected'
  if (details) {
    return `${prefix}: ${details.error}: ${details.description}${details.scope ? ` (scope=${details.scope})` : ''}`
  }
  const fallback = options?.fallback ?? (error instanceof Error ? error.message : String(error))
  return `${prefix}: ${fallback}`
}

export function getCloudflareWaitUntil(event: H3Event): ((_promise: Promise<unknown>) => void) | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (event.context.cloudflare as any)?.context as { waitUntil?: (_p: Promise<unknown>) => void } | undefined
  return ctx?.waitUntil?.bind(ctx)
}

export function scheduleMcpKvHtmlPurge(options: {
  event: H3Event
  kv: KVNamespace | undefined
  hostnames: (string | null | undefined)[]
  logPrefix: string
}) {
  const { event, kv, hostnames, logPrefix } = options
  if (!kv) return
  const uniqueHostnames = [...new Set(hostnames.filter((value): value is string => Boolean(value)))]
  if (uniqueHostnames.length === 0) return

  const purgeAsync = purgeSiteKvCache(kv, uniqueHostnames).catch((err: unknown) => {
    console.warn(`[${logPrefix}] failed:`, String(err))
  })

  const waitUntil = getCloudflareWaitUntil(event)
  if (waitUntil) {
    waitUntil(purgeAsync)
  }
  // purgeAsync already runs detached whether or not waitUntil is available
}

export function isMcpMutatingTool(tool: { annotations?: { readOnlyHint?: boolean } } | undefined | null) {
  return tool?.annotations?.readOnlyHint === false
}
