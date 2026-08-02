export function useOrgSettings() {
  const { organization } = useDashboardSite()

  const orgBase = computed(() => {
    const slug = organization.value?.slug
    return slug ? `/dashboard/${slug}` : null
  })

  const settingsBase = computed(() => orgBase.value ? `${orgBase.value}/settings` : null)

  return {
    orgBase,
    settingsBase,
    // Org settings pages
    general: computed(() => settingsBase.value ? `${settingsBase.value}/general` : null),
    billing: computed(() => settingsBase.value ? `${settingsBase.value}/billing` : null),
    members: computed(() => settingsBase.value ? `${settingsBase.value}/members` : null),
    // Top-level org pages (not under /settings)
    translations: computed(() => orgBase.value ? `${orgBase.value}/translations` : null),
    // Account-level pages (no org slug)
    billingItems: computed(() => '/dashboard/account/billing-items'),
  }
}
