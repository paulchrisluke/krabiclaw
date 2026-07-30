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
const NOT_FOUND = -1

function migrationNumber(fileName) {
  const match = fileName.match(/^(\d{4})_/)
  return match ? Number(match[1]) : null
}

export function findUnsafeMigrationStatements(fileName, sql, migrationContext = sql) {
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
      const dropIndex = match.index ?? 0
      const contextDropIndex = migrationContext.indexOf(match[0])
      const sequenceDropIndex = contextDropIndex === NOT_FOUND ? dropIndex : contextDropIndex
      const backupIndex = findIndex(migrationContext, new RegExp(`CREATE\\s+TABLE\\s+\`?${backupName}\`?\\s+AS\\s+SELECT\\s+\\*\\s+FROM\\s+\`?${table}\`?`, 'i'))
      const newTableIndex = findIndex(sql, new RegExp(`CREATE\\s+TABLE\\s+\`?${newTableName}\`?`, 'i'))
      const restoreIndex = findIndex(sql, new RegExp(`INSERT\\s+INTO\\s+\`?${table}\`?\\s+SELECT\\s+\\*\\s+FROM\\s+\`?${backupName}\`?`, 'i'))
      const newTableRestoreIndex = findIndex(sql, new RegExp(`INSERT\\s+INTO\\s+\`?${newTableName}\`?`, 'i'))
      const countAssertionIndex = findIndex(migrationContext, new RegExp(`${table}_backup_count_mismatch[\\s\\S]+COUNT\\(\\*\\)\\s+FROM\\s+\`?${backupName}\`?[\\s\\S]+COUNT\\(\\*\\)\\s+FROM\\s+\`?${table}\`?`, 'i'), sequenceDropIndex)
      const fkAssertionIndex = findIndex(migrationContext, /pragma_foreign_key_check/i, sequenceDropIndex)
      const contextBeforeCount = countAssertionIndex === NOT_FOUND ? migrationContext : migrationContext.slice(0, countAssertionIndex)
      const assertMatches = [...contextBeforeCount.matchAll(/CREATE\s+TABLE\s+[`"]?(__um_assert_[0-9]+)[`"]?/gi)]
      const assertNameMatch = assertMatches.at(-1)
      const assertName = assertNameMatch?.[1] ?? ''
      const dropsAssertIndex = assertName ? findIndex(migrationContext, new RegExp(`DROP\\s+TABLE\\s+\`?${assertName}\`?`, 'i'), sequenceDropIndex) : NOT_FOUND
      const dropsBackupIndex = findIndex(migrationContext, new RegExp(`DROP\\s+TABLE\\s+\`?${backupName}\`?`, 'i'), sequenceDropIndex)
      const hasBackup = backupIndex !== NOT_FOUND && backupIndex < sequenceDropIndex
      const hasNewTable = newTableIndex !== NOT_FOUND
      const hasRestore = restoreIndex !== NOT_FOUND || newTableRestoreIndex !== NOT_FOUND
      const hasAssertionsAfterRebuild = countAssertionIndex > sequenceDropIndex
        && fkAssertionIndex > sequenceDropIndex
        && dropsAssertIndex > countAssertionIndex
      const hasCleanupAfterAssertions = dropsBackupIndex > countAssertionIndex
      const hasRelationshipPreservation = hasBackup
        ? hasRestore && countAssertionIndex !== NOT_FOUND && hasCleanupAfterAssertions
        : hasNewTable && hasRestore && countAssertionIndex !== NOT_FOUND && hasCleanupAfterAssertions

      if (!hasRelationshipPreservation || !hasAssertionsAfterRebuild) {
        findings.push(`DROP TABLE ${table} must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup`)
      }
    }
  }
  return findings
}

function findIndex(text, pattern, startIndex = 0) {
  const match = pattern.exec(text.slice(Math.max(0, startIndex)))
  return match ? match.index + Math.max(0, startIndex) : NOT_FOUND
}

export async function checkMigrationDirectory(migrationsDir) {
  const files = (await readdir(migrationsDir)).filter(file => /^\d{4}_.+\.sql$/.test(file)).sort()
  const violations = []
  const migrationSql = new Map()
  for (const file of files) migrationSql.set(file, await readFile(path.join(migrationsDir, file), 'utf8'))
  const migrationContext = Array.from(migrationSql.values()).join('\n')
  for (const file of files) {
    const sql = migrationSql.get(file) ?? ''
    for (const reason of findUnsafeMigrationStatements(file, sql, migrationContext)) violations.push(`${file}: ${reason}`)
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
