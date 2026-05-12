import DOMPurify from 'isomorphic-dompurify'

let hooksConfigured = false

export default defineNuxtPlugin(() => {
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
