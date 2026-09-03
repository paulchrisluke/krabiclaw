import { dashboardFetch } from '~/composables/dashboardFetch'

// Organization AI credit balance, shown on the account profile page. Lifted out
// of DashboardAccountMenu when that dropdown was reduced to a plain avatar link,
// so this stayed one implementation rather than being rewritten inline.
interface OrganizationCreditsResource {
  periodAllowance: number | null
  periodUsed: number
  periodRemaining: number | null
  unlimited: boolean
  reconciliationRequired: boolean
}

const isOrganizationCreditsResource = (value: unknown): value is OrganizationCreditsResource =>
  isRecord(value)
  && (value.periodAllowance === null || typeof value.periodAllowance === 'number')
  && typeof value.periodUsed === 'number'
  && (value.periodRemaining === null || typeof value.periodRemaining === 'number')
  && typeof value.unlimited === 'boolean'
  && typeof value.reconciliationRequired === 'boolean'

export async function useAccountCredits() {
  const dashboard = useDashboardSite()
  const credits = useState<OrganizationCreditsResource | null>('dashboard-account-credits', () => null)
  const creditsOrganizationId = useState<string | null>('dashboard-account-credits-organization-id', () => null)

  if (import.meta.server) {
    const requestEvent = useRequestEvent()
    const organization = dashboard.organization.value
    if (requestEvent && organization?.id) {
      const [{ cloudflareEnv }, { getOrganizationCreditsResource }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/ai-credits'),
      ])
      const db = cloudflareEnv(requestEvent).DB
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      credits.value = await getOrganizationCreditsResource(db, organization.id)
      creditsOrganizationId.value = organization.id
    }
  }

  const usageLabel = computed(() => {
    const resource = credits.value
    if (!resource || resource.reconciliationRequired) return null
    if (resource.unlimited) return 'Unlimited'
    if (resource.periodAllowance === null || resource.periodAllowance <= 0 || resource.periodRemaining === null) return null
    const percentLeft = Math.round((resource.periodRemaining / resource.periodAllowance) * 100)
    return `${percentLeft}% left`
  })

  const creditsRequestId = useState('dashboard-account-credits-request-id', () => 0)

  if (import.meta.client) {
    watch(() => dashboard.organization.value?.id, async (organizationId) => {
      const requestId = ++creditsRequestId.value
      const orgSlug = dashboard.organization.value?.slug
      if (!organizationId || !orgSlug) {
        credits.value = null
        creditsOrganizationId.value = null
        return
      }
      if (creditsOrganizationId.value === organizationId) return
      credits.value = null
      creditsOrganizationId.value = null
      try {
        const resource = await dashboardFetch<OrganizationCreditsResource>('/api/billing/credits', { orgSlug }, {
          method: 'GET',
          validate: isOrganizationCreditsResource,
        })
        if (requestId === creditsRequestId.value) {
          credits.value = resource
          creditsOrganizationId.value = organizationId
        }
      } catch {
        if (requestId === creditsRequestId.value) credits.value = null
      }
    }, { immediate: true })
  }

  return { usageLabel }
}
