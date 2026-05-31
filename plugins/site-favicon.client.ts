export default defineNuxtPlugin(() => {
  const { site } = useTenantSite()

  useHead(computed(() => {
    const logoUrl = (site as { logo_url?: string | null; brand_name?: string | null } | null | undefined)?.logo_url
    const brandName = (site as { brand_name?: string | null } | null | undefined)?.brand_name ?? ''
    const letter = brandName.charAt(0).toUpperCase() || 'K'

    if (logoUrl) {
      return {
        link: [
          { rel: 'icon', href: logoUrl, sizes: '96x96' },
          { rel: 'icon', href: logoUrl },
          { rel: 'shortcut icon', href: logoUrl },
          { rel: 'apple-touch-icon', sizes: '180x180', href: logoUrl },
        ],
      }
    }

    // Fallback: first letter of brand name in a dark circle SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%231F2547"/><text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="white">${letter}</text></svg>`
    const fallback = `data:image/svg+xml,${svg}`

    return {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: fallback },
        { rel: 'shortcut icon', href: fallback },
        { rel: 'apple-touch-icon', sizes: '180x180', href: fallback },
      ],
    }
  }))
})
