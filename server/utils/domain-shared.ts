export function normalizeDomain(domain: string): string {
  if (!domain) return ''

  return domain
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.split('?')[0]
    ?.split('#')[0]
    ?.trim()
    ?.toLowerCase()
    ?.replace(/\.$/, '') || ''
}

export function rootDomainForPair(domain: string): string {
  const normalized = normalizeDomain(domain)
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized
}

export function domainPair(domain: string, includeWww = true): string[] {
  const root = rootDomainForPair(domain)
  return includeWww ? [root, `www.${root}`] : [normalizeDomain(domain)]
}

export function canonicalDomainForPair(domain: string, includeWww = true): string {
  const root = rootDomainForPair(domain)
  return includeWww ? `www.${root}` : normalizeDomain(domain)
}
