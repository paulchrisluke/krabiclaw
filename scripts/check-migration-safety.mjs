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
const FIRST_ENFORCED_MIGRATION = 72

function migrationNumber(fileName) {
  const match = fileName.match(/^(\d{4})_/)
  return match ? Number(match[1]) : null
}

export function findUnsafeMigrationStatements(fileName, sql) {
  if (IMMUTABLE_ALLOWLIST.has(fileName)) return []
  const number = migrationNumber(fileName)
  if (number !== null && number < FIRST_ENFORCED_MIGRATION) return []

  const findings = []
  if (/\bINSERT\s+OR\s+IGNORE\b/i.test(sql)) {
    findings.push('INSERT OR IGNORE can silently discard rows during a migration')
  }

  const dropPattern = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"[]?([a-zA-Z0-9_]+)[`"\]]?/gi
  for (const match of sql.matchAll(dropPattern)) {
    const table = match[1]
    if (PROTECTED_PARENT_TABLES.has(table)) {
      const backupName = `__um_backup_${table}`
      const newTableName = `__new_${table}`
      const assertNameMatch = sql.match(/CREATE\s+TABLE\s+[`"]?(__um_assert_[0-9]+)[`"]?/i)
      const assertName = assertNameMatch?.[1] ?? ''
      const createsBackup = new RegExp(`CREATE\\s+TABLE\\s+\`?${backupName}\`?\\s+AS\\s+SELECT\\s+\\*\\s+FROM\\s+\`?${table}\`?`, 'i').test(sql)
      const createsNewTable = new RegExp(`CREATE\\s+TABLE\\s+\`?${newTableName}\`?`, 'i').test(sql)
      const restoresBackup = new RegExp(`INSERT\\s+INTO\\s+\`?${table}\`?\\s+SELECT\\s+\\*\\s+FROM\\s+\`?${backupName}\`?`, 'i').test(sql)
        || new RegExp(`INSERT\\s+INTO\\s+\`?${newTableName}\`?`, 'i').test(sql)
      const countAssertion = sql.includes(`${table}_backup_count_mismatch`)
        && new RegExp(`COUNT\\(\\*\\)\\s+FROM\\s+\`?${backupName}\`?`, 'i').test(sql)
        && new RegExp(`COUNT\\(\\*\\)\\s+FROM\\s+\`?${table}\`?`, 'i').test(sql)
      const fkAssertion = /pragma_foreign_key_check/i.test(sql)
      const dropsAssert = Boolean(assertName) && new RegExp(`DROP\\s+TABLE\\s+\`?${assertName}\`?`, 'i').test(sql)
      const dropsBackup = new RegExp(`DROP\\s+TABLE\\s+\`?${backupName}\`?`, 'i').test(sql)
      const hasRelationshipPreservation = createsBackup
        ? restoresBackup && countAssertion && dropsBackup
        : createsNewTable && restoresBackup

      if (!hasRelationshipPreservation || !fkAssertion || !dropsAssert) {
        findings.push(`DROP TABLE ${table} must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup`)
      }
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
