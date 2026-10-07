import { authClient } from '~/lib/auth-client'
import { isAccountActivityResponse, type AccountActivityResponse } from '~/shared/account-activity'

export function useAccountActivity() {
  const session = authClient.useSession()
  return useAsyncData(
    () => `account-activity:${session.value.data?.user.id}`,
    () => applicationFetch<AccountActivityResponse>('/api/account', { validate: isAccountActivityResponse }),
  )
}
