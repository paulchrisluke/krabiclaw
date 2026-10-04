import { authClient } from '~/lib/auth-client'

/** Connect through provider OAuth; the callback names only the account it linked. */
export function useIntegrationConnection(provider: string, scopes: readonly string[] = []) {
  const route = useRoute()
  const router = useRouter()
  const accountId = ref(typeof route.query.account_id === 'string' ? route.query.account_id : undefined)
  const error = ref(oauthErrorMessage(route.query.error, route.query.error_description))
  const linking = ref(false)

  async function connect(additionalParams?: Record<string, string>) {
    linking.value = true
    error.value = ''
    try {
      const callbackURL = router.resolve({ path: route.path, query: { ...route.query, account_id: undefined, error: undefined, error_description: undefined } }).href
      const { error: failure } = await authClient.linkSocial({
        provider,
        scopes: [...scopes],
        callbackURL,
        errorCallbackURL: callbackURL,
        additionalParams,
      })
      if (failure) throw new Error(failure.message || `Could not start the ${provider} connection.`)
    } catch (cause) {
      error.value = getErrorMessage(cause, `Could not start the ${provider} connection.`)
      linking.value = false
    }
  }

  async function clear() {
    accountId.value = undefined
    await navigateTo({ query: { ...route.query, account_id: undefined, error: undefined, error_description: undefined } }, { replace: true })
  }

  return { accountId, error, linking, connect, clear }
}
