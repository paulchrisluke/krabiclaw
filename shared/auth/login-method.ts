// Maps a Better Auth endpoint path to the method name stored by its
// lastLoginMethod plugin. The plugin owns the cookie and its lifetime; this is
// only the resolver it calls. We keep no identity of our own — Better Auth's
// session is the single source of truth for who the user is.
export function loginMethodForPath(path: string | undefined): 'google' | 'email' | null {
  if (path === '/callback/google') return 'google'
  if (path === '/sign-in/email' || path === '/sign-up/email') return 'email'
  return null
}
