const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Allowlists a URL's protocol before it's used as an href/src, rejecting
 * javascript:/data:/vbscript: etc. Relative and fragment URLs are preserved.
 * Resolving against a base lets the WHATWG URL parser normalize obfuscation
 * (e.g. embedded tabs/newlines in `java\tscript:`) before the protocol check.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  const trimmed = (url ?? '').trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed, 'https://sanitize-url.invalid')
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? trimmed : ''
  } catch {
    return ''
  }
}
