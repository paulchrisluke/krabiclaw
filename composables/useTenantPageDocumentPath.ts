import { usePublicTemplate } from '~/composables/usePublicTemplate'

/**
 * The path this route's tenant page document lives at, from the one declaration
 * in utils/template-registry.ts.
 *
 * A route used to name its own path inline, which made every page a separate
 * statement of where documents live and let the writer and the renderer drift
 * apart. A template that declares nothing for this route renders no document
 * here, so the route is a 404 for that template rather than a page reading
 * somebody else's path.
 */
export function useTenantPageDocumentPath(key: string, kind: 'recipe' | 'path' = 'recipe') {
  const { template } = usePublicTemplate()
  return computed(() => {
    const documents = template.value?.pageDocuments
    const path = kind === 'recipe' ? documents?.recipes[key] : documents?.paths.find(entry => entry === key)
    if (!path) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
    return path
  })
}
