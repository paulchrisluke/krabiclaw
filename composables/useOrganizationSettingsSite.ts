export function useOrganizationSettingsSite() {
  const dashboard = useDashboardSite()
  const route = useRoute()
  const router = useRouter()

  const siteOptions = computed(() => dashboard.sites.value
    .filter((site) => Boolean(site.subdomain))
    .map((site) => ({
      label: site.brand_name ?? site.subdomain ?? 'Site',
      value: site.subdomain as string,
    })))

  const selectedSiteSlug = computed<string | undefined>({
    get() {
      const querySite = typeof route.query.site === 'string' ? route.query.site : undefined
      return querySite && siteOptions.value.some((site) => site.value === querySite)
        ? querySite
        : undefined
    },
    set(siteSlug) {
      void router.replace({
        name: route.name as string,
        params: route.params,
        query: { ...route.query, site: siteSlug || undefined },
      })
    },
  })

  const selectedSite = computed(() => dashboard.sites.value.find(
    (site) => site.subdomain === selectedSiteSlug.value,
  ) ?? null)

  return {
    dashboard,
    siteOptions,
    selectedSiteSlug,
    selectedSite,
    selectedSiteId: computed(() => selectedSite.value?.id ?? null),
  }
}
