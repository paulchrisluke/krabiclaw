import { authClient } from '~/lib/auth-client'

/**
 * Whether the signed-in user may delete this organization, answered by Better
 * Auth's own permission check for that organization — the same decision it
 * enforces on the delete itself. A failed check is an error, not a "no".
 */
export function useOrganizationDeletePermission(organizationId: Ref<string>) {
  const { data, pending, error } = useAsyncData(
    () => `organization-delete-permission:${organizationId.value}`,
    async () => {
      const result = await authClient.organization.hasPermission({ organizationId: organizationId.value, permissions: { organization: ['delete'] } })
      if (result.error) throw new Error(result.error.message || 'Your permissions could not be checked.')
      return result.data.success === true
    },
    { server: false, watch: [organizationId] },
  )
  return {
    canDelete: computed(() => data.value === true),
    permissionPending: computed(() => pending.value || (data.value === undefined && !error.value)),
    permissionError: computed(() => error.value ? getErrorMessage(error.value, 'Your permissions could not be checked.') : null),
  }
}
