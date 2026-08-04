type DomPurify = typeof import('isomorphic-dompurify')['default']

let domPurifyPromise: Promise<DomPurify> | undefined

export function loadDomPurify(): Promise<DomPurify> {
  return domPurifyPromise ??= import('isomorphic-dompurify').then(({ default: DOMPurify }) => {
    DOMPurify.addHook('uponSanitizeAttribute', (_, data) => {
      if (data.attrName?.toLowerCase().startsWith('on')) {
        data.keepAttr = false
      }

      const value = String(data.attrValue || '').trim().toLowerCase()
      if (value.startsWith('data:')) {
        data.keepAttr = false
      }
    })

    return DOMPurify
  })
}
