#!/usr/bin/env node
/**
 * Gives every published post the slug its public path is made of.
 *
 * Publishing on a schedule used to write `status='published'` with `slug` NULL
 * (fixed in publishDuePosts), so those rows answered at their row id while
 * their translations announced a real slug. #995 stopped the read side from
 * papering over that with `?? post.id` and made it throw instead — which is
 * correct for a row that cannot have a public path, and which turns the CMS
 * post list and the public /posts page into a 500 for every tenant still
 * holding one of those rows. This repairs the rows so nothing has to throw.
 *
 * Where a translation of the post already carries a slug, that slug is the one
 * the site has been announcing, so the root adopts it rather than inventing a
 * second address. Otherwise the slug comes from the title through the same
 * normalizePostSlug the editor uses, with the same `-2`, `-3` suffixes
 * allocatePostSlug appends on a collision.
 *
 * Data only: no schema change, so this is not a migration (see CLAUDE.md).
 * It is idempotent and touches no row that already has a slug.
 *
 * Usage:
 *   node --experimental-strip-types scripts/backfill-post-slugs.ts --local
 *   node --experimental-strip-types scripts/backfill-post-slugs.ts --env preview
 *   node --experimental-strip-types scripts/backfill-post-slugs.ts --env staging
 *   node --experimental-strip-types scripts/backfill-post-slugs.ts --env production
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { normalizePostSlug } from '../utils/post-slugs.ts'

const ROOT = resolve(import.meta.dirname, '..')
const WRANGLER_BIN = join(ROOT, 'node_modules', '.bin', 'wrangler')
const MAX_SLUG_ATTEMPTS = 25

function readOption(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const local = process.argv.includes('--local')
const environment = readOption('--env')
if (!local && !environment) {
  console.error('Pass --local or --env <preview|staging|production>')
  process.exit(1)
}
// The production binding is the top-level [[d1_databases]]; every other
// environment is addressed through wrangler's --env flag (scripts/reset-d1.mjs
// says the same thing, for the same reason).
const target = local
  ? ['--local']
  : [...(environment === 'production' ? [] : ['--env', environment!]), '--remote']

function d1<T>(sql: string): T[] {
  const result = spawnSync(WRANGLER_BIN, ['d1', 'execute', 'DB', ...target, '--json', '--command', sql], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: join(tmpdir(), 'krabiclaw-wrangler-logs') },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Wrangler failed for: ${sql}`)
  const payload = JSON.parse(result.stdout) as Array<{ results?: T[] }>
  return payload.flatMap(entry => entry.results ?? [])
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

interface BrokenRow {
  id: string
  site_id: string
  locale: string
  title: string | null
  body: string | null
  translation_slug: string | null
}

const broken = d1<BrokenRow>(`
  SELECT p.id, p.site_id, p.locale, p.title, p.summary AS body,
         (SELECT t.slug FROM content_documents t
           WHERE t.root_id = p.id AND t.kind = 'social_post' AND t.slug IS NOT NULL
           ORDER BY t.locale LIMIT 1) AS translation_slug
    FROM content_documents p
   WHERE p.kind = 'social_post' AND p.row_role = 'root'
     AND p.status = 'published' AND (p.slug IS NULL OR trim(p.slug) = '')
   ORDER BY p.site_id, p.id
`)

if (!broken.length) {
  console.log('Every published post already has a slug.')
  process.exit(0)
}

// One read of the slugs the unique index actually guards:
// (site_id, kind, locale, slug) across root and representation rows.
const takenRows = d1<{ site_id: string, locale: string, slug: string }>(`
  SELECT site_id, locale, slug FROM content_documents
   WHERE kind = 'social_post' AND row_role IN ('root', 'representation') AND slug IS NOT NULL
`)
const slugKey = (siteId: string, locale: string, slug: string) => JSON.stringify([siteId, locale, slug])
const taken = new Set(takenRows.map(row => slugKey(row.site_id, row.locale, row.slug)))
const key = (row: BrokenRow, slug: string) => slugKey(row.site_id, row.locale, slug)

function allocate(row: BrokenRow): string {
  // The translation already publishes this address for this post; adopting it
  // keeps one post at one path instead of minting a second one.
  if (row.translation_slug && !taken.has(key(row, row.translation_slug))) return row.translation_slug
  const base = normalizePostSlug(row.title ?? row.body?.slice(0, 80) ?? row.id)
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    if (!taken.has(key(row, slug))) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

let changed = 0
for (const row of broken) {
  const slug = allocate(row)
  taken.add(key(row, slug))
  const updated = d1<{ id: string }>(`
    UPDATE content_documents SET slug = ${quote(slug)}
     WHERE id = ${quote(row.id)} AND kind = 'social_post' AND row_role = 'root'
       AND status = 'published' AND (slug IS NULL OR trim(slug) = '')
   RETURNING id
  `)
  if (!updated.length) {
    console.error(`${row.site_id}: ${row.id} was not updated; re-run to see whether it still lacks a slug.`)
    process.exit(1)
  }
  console.log(`${row.site_id}: ${row.id} -> ${slug}${row.translation_slug === slug ? ' (adopted from its translation)' : ''}`)
  changed += 1
}

const remaining = d1<{ rows: number }>(`
  SELECT count(*) AS rows FROM content_documents
   WHERE kind = 'social_post' AND row_role = 'root' AND status = 'published'
     AND (slug IS NULL OR trim(slug) = '')
`)
if (Number(remaining[0]?.rows ?? 0) !== 0) {
  console.error(`${remaining[0]?.rows} published post(s) still have no slug.`)
  process.exit(1)
}
console.log(`Every published post has a slug (${changed} row(s) repaired).`)
