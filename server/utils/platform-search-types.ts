export const PUBLIC_SEARCH_TYPES = ['all', 'doc', 'blog', 'faq', 'route', 'platform_page', 'dashboard_route'] as const

export type PublicSearchTypeFilter = typeof PUBLIC_SEARCH_TYPES[number]
