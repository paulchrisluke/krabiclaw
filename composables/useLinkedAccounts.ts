import { authClient } from '~/lib/auth-client'

export interface LinkedAccountOption {
  id: string
  label: string
}

/**
 * The signed-in user's Better Auth linked accounts for one provider that have
 * granted `scopes`, named the way the provider knows them, and the action that
 * links another. Linking is Better Auth's own linkSocial: it owns the
 * redirect, the callback, the token storage and the scope merge, and returns
 * here — to `returnTo`, or with `?error=` when it did not finish.
 */
export function useLinkedAccounts(providerId: string, scopes: readonly string[] = []) {
  const accounts = useAsyncData(`linked-accounts:${providerId}:${scopes.join(' ')}`, async (): Promise<LinkedAccountOption[]> => {
    const { data, error } = await authClient.listAccounts()
    if (error) throw new Error(error.message || 'Linked accounts could not be loaded.')
    const matching = (data ?? []).filter(account =>
      account.providerId === providerId && scopes.every(scope => account.scopes.includes(scope)))
    return await Promise.all(matching.map(async (account) => {
      const { data: info, error: infoError } = await authClient.accountInfo({ query: { accountId: account.id } })
      if (infoError) throw new Error(infoError.message || `The linked ${providerId} account could not be read.`)
      return { id: account.id, label: info?.user.email || info?.user.name || account.accountId }
    }))
  }, { lazy: true, server: false })

  async function link(returnTo: string, additionalParams?: Record<string, string>) {
    const { error } = await authClient.linkSocial({
      provider: providerId,
      scopes: [...scopes],
      callbackURL: returnTo,
      errorCallbackURL: returnTo,
      additionalParams,
    })
    if (error) throw new Error(error.message || `Could not start linking ${providerId}.`)
  }

  return { ...accounts, link }
}
