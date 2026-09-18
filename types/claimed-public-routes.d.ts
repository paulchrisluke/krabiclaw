// The route table the build emits for the Worker; see build/claimed-public-routes.ts
// and the nitro:config hook in nuxt.config.ts that writes it.
declare module '#claimed-public-routes' {
  import type { ClaimedRoute } from '../build/claimed-public-routes'
  export const CLAIMED_PUBLIC_ROUTES: ClaimedRoute[]
}
