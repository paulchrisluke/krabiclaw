export default defineNuxtPlugin(() => {
  const { site } = useTenantSite()

  useHead(computed(() => {
    const logoUrl = (site.value as { logo_url?: string | null } | undefined)?.logo_url
    if (!logoUrl) return {}
    return {
      link: [
        { rel: 'icon', href: logoUrl, sizes: '96x96' },
        { rel: 'icon', href: logoUrl },
        { rel: 'shortcut icon', href: logoUrl },
        { rel: 'apple-touch-icon', sizes: '180x180', href: logoUrl },
      ],
    }
  }))
})
