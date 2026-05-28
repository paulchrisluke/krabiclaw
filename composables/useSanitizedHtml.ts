import { ref, watch, onMounted, type Ref } from 'vue'

export function useSanitizedHtml(rawHtml: Ref<string | undefined | null> | (() => string | undefined | null)) {
  const sanitized = ref('')
  
  // Handle both ref and getter patterns
  const getRaw = () => typeof rawHtml === 'function' ? rawHtml() : rawHtml.value
  
  onMounted(async () => {
    const raw = getRaw()
    if (raw) {
      const DOMPurify = (await import('isomorphic-dompurify')).default
      sanitized.value = DOMPurify.sanitize(raw)
    }
  })
  
  if (import.meta.server) {
    sanitized.value = getRaw() || ''
  }
  
  watch(() => getRaw(), async (newVal) => {
    if (import.meta.client && newVal) {
      const DOMPurify = (await import('isomorphic-dompurify')).default
      sanitized.value = DOMPurify.sanitize(newVal)
    } else if (!newVal) {
      sanitized.value = ''
    }
  })
  
  return sanitized
}
