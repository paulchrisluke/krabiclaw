let hooksConfigured = false

export default defineNuxtPlugin(async () => {
  if (import.meta.server) return

  const DOMPurify = (await import('isomorphic-dompurify')).default

  if (hooksConfigured) return
  hooksConfigured = true

  DOMPurify.addHook('uponSanitizeAttribute', (_, data) => {
    if (data.attrName?.toLowerCase().startsWith('on')) {
      data.keepAttr = false
    }

    const value = String(data.attrValue || '').trim().toLowerCase()
    if (value.startsWith('data:')) {
      data.keepAttr = false
    }
  })
})
