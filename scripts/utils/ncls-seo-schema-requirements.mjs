export const ROUTES_RENDERING_ORGANIZATION_QA = new Set(['/', '/services', '/about', '/contact', '/schedule', '/pricing', '/donate'])

export function createRequiredTypesForPath({ servicePathsWithFaqs, organizationPagesWithQa, generalOrganizationQaExists }) {
  function withFaq(path, types) {
    const hasPageQa = organizationPagesWithQa.has(path)
    const fallsBackToGeneralQa = ROUTES_RENDERING_ORGANIZATION_QA.has(path) && generalOrganizationQaExists && !hasPageQa
    return hasPageQa || fallsBackToGeneralQa ? [...types, 'FAQPage'] : types
  }

  return function requiredTypesForPath(path) {
    if (path === '/') return withFaq('/', [])
    if (path === '/services') return withFaq('/services', ['CollectionPage', 'BreadcrumbList', 'ItemList'])
    if (/^\/services\/[^/]+$/.test(path)) return ['LegalService', 'BreadcrumbList', ...(servicePathsWithFaqs.has(path) ? ['FAQPage'] : [])]
    if (path === '/about') return withFaq('/about', ['AboutPage', 'BreadcrumbList'])
    if (path === '/contact') return withFaq('/contact', ['ContactPage', 'BreadcrumbList'])
    if (path === '/schedule') return withFaq('/schedule', ['BreadcrumbList'])
    if (path === '/pricing') return withFaq('/pricing', ['BreadcrumbList'])
    if (path === '/donate') return withFaq('/donate', ['BreadcrumbList'])
    if (path === '/blog') return ['CollectionPage', 'BreadcrumbList', 'ItemList']
    if (path.startsWith('/article/')) return ['BlogPosting', 'BreadcrumbList']
    if (['/policies/privacy', '/policies/terms', '/third-party-notices'].includes(path)) return ['BreadcrumbList']
    return []
  }
}
