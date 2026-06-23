import { cloudflareEnv } from '~/server/utils/api-response'
import { execute } from '~/server/db'

export default defineEventHandler(async (event) => {
  const db = cloudflareEnv(event).db

  if (db) {
    await execute(db, 'PRAGMA foreign_keys = ON')
  }
})
