#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nclsFixture, type NclsSeedTable, type NclsSeedValue } from '../seed-definitions/ncls.ts'

function sqlValue(value: NclsSeedValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return `'${value.replace(/'/g, "''")}'`
}

function table(name: string): NclsSeedTable {
  const definition = nclsFixture.tables.find(candidate => candidate.table === name)
  if (!definition) throw new Error(`Missing NCLS fixture table: ${name}`)
  return definition
}

function renderRows(definition: NclsSeedTable, transform?: (_row: Record<string, NclsSeedValue>) => Record<string, NclsSeedValue>): string {
  if (definition.rows.length === 0) return ''
  return definition.rows.map((source) => {
    const row = transform ? transform({ ...source }) : source
    const columns = Object.keys(row)
    const values = columns.map(column => sqlValue(row[column] ?? null))
    return `INSERT INTO ${definition.table} (${columns.join(', ')}) VALUES (${values.join(', ')});`
  }).join('\n')
}

function omitColumns(
  row: Record<string, NclsSeedValue>,
  columns: string[],
): Record<string, NclsSeedValue> {
  const omitted = new Set(columns)
  return Object.fromEntries(Object.entries(row).filter(([column]) => !omitted.has(column)))
}

function canonicalPageVariant(row: Record<string, NclsSeedValue>): Record<string, NclsSeedValue> {
  const result = omitColumns(row, [
    'draft_document_id',
    'published_revision_id',
    'published_path',
    'draft_path',
    'ever_published',
    'status',
  ])
  result.document_id = row.draft_document_id ?? null
  result.path = row.published_path ?? row.draft_path ?? '/'
  return result
}

function canonicalTenantPage(row: Record<string, NclsSeedValue>): Record<string, NclsSeedValue> {
  return omitColumns(row, ['path', 'status'])
}

function canonicalOffering(row: Record<string, NclsSeedValue>): Record<string, NclsSeedValue> {
  return omitColumns(row, ['status'])
}

export function renderNclsFixtureSql(): string {
  const site = table('sites').rows[0]
  if (!site) throw new Error('NCLS fixture has no site row')
  const initialSite = (row: Record<string, NclsSeedValue>) => ({
    ...row,
    primary_location_id: null,
    logo_asset_id: null,
  })

  const afterCore = [
    'site_locales',
    'site_domains',
    'tenant_compliance',
    'site_consultation_settings',
    'site_theme_tokens',
    'location_qa',
    'reviews',
    'offerings',
  ].map(name => renderRows(table(name), name === 'offerings' ? canonicalOffering : undefined)).filter(Boolean).join('\n\n')

  return `PRAGMA foreign_keys = ON;

DELETE FROM content_blocks
 WHERE document_id IN (
   SELECT id FROM content_documents
    WHERE (owner_type = 'tenant_page' AND owner_id IN (SELECT id FROM tenant_page_variants WHERE site_id = ${sqlValue(nclsFixture.siteId)}))
       OR (owner_type = 'tenant_blog' AND owner_id IN (SELECT id FROM blog_posts WHERE site_id = ${sqlValue(nclsFixture.siteId)}))
 );
DELETE FROM content_documents
 WHERE (owner_type = 'tenant_page' AND owner_id IN (SELECT id FROM tenant_page_variants WHERE site_id = ${sqlValue(nclsFixture.siteId)}))
    OR (owner_type = 'tenant_blog' AND owner_id IN (SELECT id FROM blog_posts WHERE site_id = ${sqlValue(nclsFixture.siteId)}));
UPDATE sites
   SET primary_location_id = NULL, logo_asset_id = NULL
 WHERE id = ${sqlValue(nclsFixture.siteId)} OR subdomain = 'ncls';
DELETE FROM sites WHERE id = ${sqlValue(nclsFixture.siteId)} OR subdomain = 'ncls';
DELETE FROM organization WHERE id = ${sqlValue(nclsFixture.organizationId)} OR slug = 'north-carolina-legal-services';
DELETE FROM user WHERE id = ${sqlValue(nclsFixture.user.id)};
DELETE FROM site_domains
 WHERE domain IN ('ncls.localhost', 'ncls.krabiclaw.com', 'www.northcarolinalegalservices.org', 'northcarolinalegalservices.org');

INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('blawby-theme-v1', 'Blawby', 'blawby', '1.0.0', 'Professional-service public template', 'active');

INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (${sqlValue(nclsFixture.user.id)}, ${sqlValue(nclsFixture.user.name)}, ${sqlValue(nclsFixture.user.email)}, 1, 'user', unixepoch(), unixepoch());

INSERT INTO organization (id, name, slug, createdAt)
VALUES (${sqlValue(nclsFixture.organizationId)}, 'North Carolina Legal Services', 'north-carolina-legal-services', unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-ncls-blawby', ${sqlValue(nclsFixture.organizationId)}, ${sqlValue(nclsFixture.user.id)}, 'owner', unixepoch());

${renderRows(table('sites'), initialSite)}

${renderRows(table('business_locations'))}

${renderRows(table('media_assets'))}

UPDATE sites
   SET primary_location_id = ${sqlValue(site.primary_location_id ?? null)},
       logo_asset_id = ${sqlValue(site.logo_asset_id ?? null)}
 WHERE id = ${sqlValue(nclsFixture.siteId)};

${renderRows(table('tenant_pages'), canonicalTenantPage)}

${renderRows(table('blog_posts'), row => omitColumns(row, ['scheduled_revision_id']))}

${renderRows(table('content_documents'), row => omitColumns(row, ['draft_revision_id', 'published_revision_id']))}

${renderRows(table('content_blocks'))}

${renderRows(table('tenant_page_variants'), canonicalPageVariant)}

${renderRows(table('blog_post_redirects'))}

${afterCore}
`
}

function runCli() {
  const isStdout = process.argv.includes('--stdout')
  const isPreview = process.argv.includes('--preview')
  if (process.argv.includes('--remote') || process.argv.includes('--staging')) {
    throw new Error('This seed supports only local and preview databases.')
  }

  const sql = renderNclsFixtureSql()
  if (isStdout) {
    process.stdout.write(sql)
    return
  }

  const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-seed-ncls-'))
  const sqlPath = join(directory, 'ncls.sql')
  try {
    writeFileSync(sqlPath, sql, 'utf8')
    execFileSync('npx', [
      'wrangler', 'd1', 'execute', 'DB',
      ...(isPreview ? ['--env', 'preview', '--remote'] : ['--local']),
      '--file', sqlPath,
    ], { stdio: 'inherit' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
