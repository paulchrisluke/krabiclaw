import { cloudflareEnv, isInternalSelfFetch } from '~/server/utils/api-response'
import { rawClient } from '~/server/db'

export default defineEventHandler(async (event) => {
  // Nested self-fetches (i18n/icon/internal API calls during SSR) are already
  // inside a request whose real inbound pass already set this pragma — skip
  // the redundant DB round-trip and the synthetic missing-bindings warning.
  if (isInternalSelfFetch(event)) return

  const db = cloudflareEnv(event).db

  if (db) {
    await rawClient(db).prepare('PRAGMA foreign_keys = ON').run()
  }
})
