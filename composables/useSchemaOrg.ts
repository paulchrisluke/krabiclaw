// Composable for adding JSON-LD schema markup to pages
export function useSchemaOrg(schema: Record<string, any>) {
  // Sanitize JSON to prevent script tag injection
  const sanitizedJson = JSON.stringify(schema).replace(/</g, '\\u003c')
  useHead({
    script: [
      {
        type: 'application/ld+json',
        innerHTML: sanitizedJson
      }
    ]
  })
}

export function useOrganizationSchema() {
  useSchemaOrg({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KrabiClaw',
    url: 'https://krabiclaw.com',
    logo: 'https://krabiclaw.com/krabi-claw-logo.png',
    description: 'The Shopify for restaurants. AI-powered restaurant website builder built in Krabi, Thailand.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Krabi',
      addressCountry: 'TH'
    },
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
    description: 'AI-powered restaurant website builder',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://krabiclaw.com/search?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  })
}

export function useBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return
  }
  
  const validItems = items.filter(item => {
    const name = item.name?.trim()
    const url = item.url?.trim()
    return name && url
  })
  
  if (validItems.length === 0) {
    return
  }
  
  // Convert relative URLs to absolute
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://krabiclaw.com'
  
  useSchemaOrg({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: validItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`
    }))
  })
}

export function useArticleSchema(title: string, description: string, publishedAt: string, author: string) {
  // Validate required fields
  const trimmedTitle = title?.trim()
  const trimmedDescription = description?.trim()
  const trimmedAuthor = author?.trim()
  
  if (!trimmedTitle || !trimmedDescription || !trimmedAuthor) {
    console.warn('useArticleSchema: missing required fields (title, description, or author)')
    return
  }
  
  // Validate and normalize publishedAt to ISO 8601
  let normalizedDate = publishedAt
  if (publishedAt) {
    try {
      const date = new Date(publishedAt)
      if (isNaN(date.getTime())) {
        console.warn('useArticleSchema: invalid date format for publishedAt')
        return
      }
      normalizedDate = date.toISOString()
    } catch (e) {
      console.warn('useArticleSchema: error parsing publishedAt', e)
      return
    }
  }
  
  useSchemaOrg({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: trimmedTitle,
    description: trimmedDescription,
    datePublished: normalizedDate,
    author: {
      '@type': 'Person',
      name: trimmedAuthor
    },
    publisher: {
      '@type': 'Organization',
      name: 'KrabiClaw',
      logo: 'https://krabiclaw.com/krabi-claw-logo.png'
    }
  })
}
