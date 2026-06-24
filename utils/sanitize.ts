/**
 * Sanitizes HTML to prevent XSS attacks.
 * IMPORTANT: When import.meta.server is true, this function returns UN-SANITIZED HTML.
 * Any use of v-html that consumes this function must be wrapped in <ClientOnly>
 * or only be used with trusted content to avoid security risks during SSR.
 */
export async function sanitizeHtml(html: string): Promise<string> {
  if (import.meta.server) {
    return html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
  const DOMPurify = (await import('isomorphic-dompurify')).default
  return DOMPurify.sanitize(html)
}

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
