const PUBLIC_MEDIA_HOST = 'media.krabiclaw.com'
const PUBLIC_MEDIA_PREFIX = '/__public-media'
const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const PLATFORM_HOSTS = new Set(['krabiclaw.com', 'www.krabiclaw.com'])

export function publicMediaUrl(value: string | null | undefined, requestHostname?: string): string | null {
  if (!value) return null
  if (value.startsWith('/')) return value

  const parsed = new URL(value)
  if (parsed.hostname !== PUBLIC_MEDIA_HOST) return value
  if (requestHostname && (LOCAL_DEVELOPMENT_HOSTS.has(requestHostname) || PLATFORM_HOSTS.has(requestHostname))) return value
  return `${PUBLIC_MEDIA_PREFIX}${parsed.pathname}${parsed.search}`
}
