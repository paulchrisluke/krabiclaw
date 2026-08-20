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
    accountProfile: computed(() => '/dashboard/account/profile'),
    accountAuth: computed(() => '/dashboard/account/authentication'),
  }
}
