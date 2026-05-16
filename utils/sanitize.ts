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
