import { authClient } from '~/lib/auth-client'

/**
 * Which of these organizations the signed-in user may delete, answered by
 * Better Auth's own permission check for each — the same decision it enforces
 * on the delete itself. A failed check is an error, not a "no".
 */
export async function useOrganizationDeletePermission(organizationIds: Ref<string[]>) {
  const { data, error } = await useAsyncData(
    () => `organization-delete-permission:${organizationIds.value.join(',')}`,
    async () => {
      const results = await Promise.all(organizationIds.value.map(async (organizationId) => {
        const result = await authClient.organization.hasPermission({ organizationId, permissions: { organization: ['delete'] } })
        if (result.error) throw new Error(result.error.message || 'Your permissions could not be checked.')
        return result.data.success === true ? organizationId : null
      }))
      return results.filter((organizationId): organizationId is string => organizationId !== null)
    },
  )
  return {
    deletable: computed(() => new Set(data.value ?? [])),
    permissionError: computed(() => error.value ? getErrorMessage(error.value, 'Your permissions could not be checked.') : null),
  }
}
