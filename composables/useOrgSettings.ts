export function useOrgSettings() {
  const { organization } = useDashboardSite()

  const orgBase = computed(() => {
    const slug = organization.value?.slug
    return slug ? `/dashboard/${slug}` : '/dashboard'
  })

  const settingsBase = computed(() => `${orgBase.value}/~/settings`)

  return {
    orgBase,
    settingsBase,
    // Org settings pages
    general: computed(() => `${settingsBase.value}/general`),
    billing: computed(() => `${settingsBase.value}/billing`),
    members: computed(() => `${settingsBase.value}/members`),
    // Top-level org pages (not under /settings)
    translations: computed(() => `${orgBase.value}/translations`),
    // Account-level pages (no org slug)
    billingItems: computed(() => '/dashboard/account/settings/billing-items'),
  }
}
