import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider'

/**
 * Network boundary for Client ID Metadata Documents and the `jwks_uri` of a
 * CIMD client. `@better-auth/cimd` requires the application to supply this
 * because the guarantees it needs cannot be built by wrapping fetch:
 *
 *   "The transport MUST resolve the hostname exactly once, reject RFC 6890
 *    special-use addresses, pin the approved address for the connection, and
 *    refuse redirects."
 *
 * The URL being fetched comes from an unauthenticated `client_id`, so this is
 * the SSRF boundary for the whole CIMD flow.
 *
 * The first three guarantees come from the `global_fetch_strictly_public`
 * compatibility flag in wrangler.toml. A Worker cannot resolve DNS or pin a
 * socket itself, so workerd enforces them inside its own resolver instead:
 * with the flag set, `fetch()` reaches only public internet addresses and
 * cannot be steered at private, link-local, or cloud-metadata ranges, nor back
 * into the zone this Worker serves. The flag is declared once at the top level
 * of wrangler.toml and inherited by preview, staging, and production.
 *
 * The fourth is this function's job. Workers does not honour
 * `redirect: "error"` the way the standard requires — it yields the redirect
 * response rather than throwing, which is the bug that previously forced a
 * patch into `node_modules`. Requesting `"manual"` and rejecting the 3xx
 * explicitly is the behaviour the contract asks for, on a runtime that will
 * not produce it on its own.
 *
 * Timeout and abort stay with the caller: the plugin passes its own signal.
 */
export const fetchCimdMetadataResource: ClientMetadataResourceFetch = async (input, init) => {
  const response = await fetch(input, { ...init, redirect: 'manual' })

  // Workers surfaces the 3xx itself; a spec-conformant runtime surfaces an
  // opaque redirect with status 0. Refuse both rather than trusting whichever
  // shape arrives.
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw new Error('Client ID Metadata Document fetch was redirected, which is not allowed')
  }

  return response
}
