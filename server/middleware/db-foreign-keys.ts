import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const db = cloudflareEnv(event).DB

  if (db) {
    await db.prepare('PRAGMA foreign_keys = ON').run()
  }
})
