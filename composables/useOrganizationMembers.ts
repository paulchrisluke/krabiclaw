import { isOrganizationMembersData, organizationMembersKey } from '~/utils/organization-members'

export function useOrganizationMembers() {
  const route = useRoute()
  const dashboardApi = useDashboardApi()
  return useAsyncData(
    () => organizationMembersKey(String(route.params.orgSlug)),
    () => dashboardApi('/api/dashboard/members', { validate: isOrganizationMembersData }),
  )
}
