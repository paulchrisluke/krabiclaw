/**
 * Where a guest creates or signs in to their platform account: the email they
 * used is offered, and once verified it joins their guest records to the account
 * (server/utils/guest-accounts.ts).
 */
export function guestAccountUrl(platformDomain: string, path: '/signup' | '/login', email?: string | null): string {
  const url = new URL(path, platformDomain)
  if (email) url.searchParams.set('email', email)
  url.searchParams.set('redirect', '/dashboard/account')
  return url.toString()
}
