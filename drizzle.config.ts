import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'drizzle-kit'

const localD1Dir = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')

function resolveLocalD1File() {
  if (!existsSync(localD1Dir)) {
    return join(process.cwd(), '.wrangler/local-d1.sqlite')
  }

  const file = readdirSync(localD1Dir).find((entry) => entry.endsWith('.sqlite'))
  return file ? join(localD1Dir, file) : join(process.cwd(), '.wrangler/local-d1.sqlite')
}

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DRIZZLE_DB_FILE ?? resolveLocalD1File(),
  },
  introspect: {
    casing: 'preserve',
  },
})
