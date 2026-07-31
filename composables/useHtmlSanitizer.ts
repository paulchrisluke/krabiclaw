import { sanitizeHtmlForSsr } from '~/utils/markdown'

export function useHtmlSanitizer() {
  const sanitize = shallowRef<(_html: string) => string>(sanitizeHtmlForSsr)

  if (import.meta.client) {
    onMounted(async () => {
      const { default: DOMPurify } = await import('isomorphic-dompurify')
      sanitize.value = (html: string) => DOMPurify.sanitize(html)
    })
  }

  return {
    sanitize: (html: string) => sanitize.value(html),
  }
}
