import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PROTECTED_PARENT_TABLES = new Set([
  'blog_posts',
  'business_locations',
  'experiences',
  'media_assets',
  'menu_items',
  'posts',
  'site_content',
])
const IMMUTABLE_ALLOWLIST = new Set(['0047_free_molecule_man.sql'])
const RELATIONSHIP_PRESERVING_REBUILD_ALLOWLIST = new Set(['0074_unified_media_physical_cleanup.sql'])
const FIRST_ENFORCED_MIGRATION = 72

function migrationNumber(fileName) {
  const match = fileName.match(/^(\d{4})_/)
  return match ? Number(match[1]) : null
}

export function findUnsafeMigrationStatements(fileName, sql) {
  if (IMMUTABLE_ALLOWLIST.has(fileName)) return []
  if (RELATIONSHIP_PRESERVING_REBUILD_ALLOWLIST.has(fileName)) {
    return sql.includes('__um_backup_business_locations') && sql.includes('__um_backup_experiences')
      ? []
      : [`${fileName} is allowlisted only when it preserves rebuilt parent relationships via explicit backups`]
  }
  const number = migrationNumber(fileName)
  if (number !== null && number < FIRST_ENFORCED_MIGRATION) return []

  const findings = []
  const dropPattern = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"[]?([a-zA-Z0-9_]+)[`"\]]?/gi
  for (const match of sql.matchAll(dropPattern)) {
    if (PROTECTED_PARENT_TABLES.has(match[1])) {
      findings.push(`DROP TABLE ${match[1]} can clear or cascade-delete referencing production data`)
    }
  }
  return findings
}

export async function checkMigrationDirectory(migrationsDir) {
  const files = (await readdir(migrationsDir)).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort()
  const violations = []
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8')
    for (const reason of findUnsafeMigrationStatements(file, sql)) violations.push(`${file}: ${reason}`)
  }
  return violations
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const violations = await checkMigrationDirectory(path.join(root, 'migrations'))
  if (violations.length) {
    console.error('Unsafe D1 migration blocked:')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exitCode = 1
    return
  }
  console.log('D1 migration safety check passed.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
