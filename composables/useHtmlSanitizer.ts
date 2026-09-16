import { sanitizeHtmlForSsr } from '~/utils/markdown'
import { loadDomPurify } from '~/utils/dom-purify-loader'

export function useHtmlSanitizer() {
  const sanitize = shallowRef<(_html: string) => string>(sanitizeHtmlForSsr)

  if (import.meta.client) {
    onMounted(async () => {
      const DOMPurify = await loadDomPurify()
      sanitize.value = (html: string) => DOMPurify.sanitize(html)
    })
  }

  return {
    sanitize: (html: string) => sanitize.value(html),
  }
}
