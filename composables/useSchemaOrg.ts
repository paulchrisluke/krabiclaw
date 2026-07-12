import { computed, toValue, type MaybeRefOrGetter } from 'vue'

// Composable for adding JSON-LD schema markup to pages
export function useSchemaOrg(schema: MaybeRefOrGetter<ApiRecord | null | undefined>) {
  const script = computed(() => {
    const value = toValue(schema)
    if (!value) return []

    return [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify(value).replace(/</g, '\\u003c'),
      },
    ]
  })

  useHead({
    script,
  })
}

export function useOrganizationSchema() {
  useSchemaOrg({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KrabiClaw',
    url: 'https://krabiclaw.com',
    logo: 'https://krabiclaw.com/krabi-claw-logo.png',
    description: 'The AI-powered website builder for local businesses. Build your web presence through conversation with ChatGPT.',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'hello@krabiclaw.com',
      contactType: 'customer service'
    }
  })
}

export function useWebSiteSchema() {
  useSchemaOrg({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'KrabiClaw',
    url: 'https://krabiclaw.com',
    description: 'AI-powered website builder for local businesses'
  })
}

export function useBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  if (!Array.isArray(items) || items.length === 0) return

  const validItems = items.filter(item => {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const url = typeof item?.url === 'string' ? item.url.trim() : ''
    return name && url
  })

  if (validItems.length === 0) return

  // Resolve relative breadcrumb URLs against the current SSR request. This keeps
  // tenant structured data on the tenant's canonical custom domain instead of
  // hardcoding the KrabiClaw platform origin.
  const requestURL = useRequestURL()
  const itemListElement = validItems.reduce((acc: ApiRecord[], item) => {
    try {
      const itemUrl = new URL(item.url, requestURL.origin).toString()
      acc.push({
        '@type': 'ListItem',
        position: acc.length + 1,
        name: item.name,
        item: itemUrl
      })
    } catch (error) {
      console.warn('useBreadcrumbSchema: invalid breadcrumb URL, skipping item', item.url, error)
    }
    return acc
  }, [])

  if (itemListElement.length === 0) return

  useSchemaOrg({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement
  })
}

export function useArticleSchema(_title: string, _description: string, _author: string): void
export function useArticleSchema(_title: string, _description: string, _publishedAt: string | undefined, _author: string): void
export function useArticleSchema(title: string, description: string, publishedAtOrAuthor?: string, maybeAuthor?: string) {
  const publishedAt = maybeAuthor === undefined ? undefined : publishedAtOrAuthor
  const author = maybeAuthor === undefined ? publishedAtOrAuthor : maybeAuthor

  const trimmedTitle = title?.trim()
  const trimmedDescription = description?.trim()
  const trimmedAuthor = author?.trim()

  if (!trimmedTitle || !trimmedDescription || !trimmedAuthor) {
    console.warn('useArticleSchema: missing required fields (title, description, or author)')
    return
  }

  let normalizedDate = publishedAt
  if (publishedAt) {
    try {
      const date = new Date(publishedAt)
      if (isNaN(date.getTime())) {
        console.warn('useArticleSchema: invalid date format for publishedAt')
        return
      }
      normalizedDate = date.toISOString()
    } catch (error) {
      console.warn('useArticleSchema: error parsing publishedAt', error)
      return
    }
  }

  const articleSchema: ApiRecord = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: trimmedTitle,
    description: trimmedDescription,
    author: {
      '@type': 'Person',
      name: trimmedAuthor
    },
    publisher: {
      '@type': 'Organization',
      name: 'KrabiClaw',
      logo: 'https://krabiclaw.com/krabi-claw-logo.png'
    }
  }

  if (normalizedDate) articleSchema.datePublished = normalizedDate

  useSchemaOrg(articleSchema)
}
