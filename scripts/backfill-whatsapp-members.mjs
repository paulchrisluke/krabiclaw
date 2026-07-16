#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const args = process.argv.slice(2)
const targetCount = ['--local', '--staging', '--remote'].filter(flag => args.includes(flag)).length
if (targetCount !== 1 || (!args.includes('--dry-run') && !args.includes('--apply'))) {
  console.error('Usage: yarn site:backfill-whatsapp-members --local|--staging|--remote --dry-run|--apply [--confirm-production]')
  process.exit(1)
}
if (args.includes('--remote') && args.includes('--apply') && !args.includes('--confirm-production')) {
  console.error('Refusing production changes without --confirm-production.')
  process.exit(1)
}

const targetArgs = args.includes('--staging') ? ['--env', 'staging', '--remote'] : args.includes('--remote') ? ['--remote'] : ['--local']
const baseUrl = args.includes('--staging') ? 'https://staging.krabiclaw.com' : args.includes('--remote') ? 'https://krabiclaw.com' : 'http://localhost:3000'
const q = value => String(value).replaceAll("'", "''")
function run(sql) {
  const result = spawnSync('node_modules/.bin/wrangler', ['d1', 'execute', 'DB', ...targetArgs, '--command', sql, '--json'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim())
  const parsed = JSON.parse(result.stdout || '[]')
  return parsed.flatMap(entry => entry.results ?? entry.result?.[0]?.results ?? [])
}
function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length >= 9) return `+66${digits.slice(1)}`
  if (digits.startsWith('66') && digits.length >= 11) return `+${digits}`
  if (digits.length >= 10) return `+${digits}`
  throw new Error(`Invalid configured phone: ${value}`)
}

const configured = run(`
  SELECT o.id AS organization_id, o.name AS organization_name, s.id AS site_id,
         NULL AS location_id, NULL AS location_name, sc.value AS phone, 'site' AS scope_type
  FROM site_config sc JOIN sites s ON s.id = sc.site_id JOIN organization o ON o.id = sc.organization_id
  WHERE sc.key = 'whatsapp_phone' AND trim(coalesce(sc.value, '')) != ''
  UNION ALL
  SELECT o.id, o.name, s.id, bl.id, bl.title, bl.notification_phone, 'location'
  FROM business_locations bl JOIN sites s ON s.id = bl.site_id JOIN organization o ON o.id = bl.organization_id
  WHERE trim(coalesce(bl.notification_phone, '')) != ''
  ORDER BY organization_name, site_id, location_id
`)

const groups = new Map()
for (const row of configured) {
  const phone = normalizePhone(row.phone)
  const key = `${row.organization_id}:${phone}`
  const group = groups.get(key) ?? { organizationId: row.organization_id, organizationName: row.organization_name, phone, scopes: [] }
  group.scopes.push({ siteId: row.site_id, locationId: row.location_id ?? null, type: row.scope_type, locationName: row.location_name ?? null })
  groups.set(key, group)
}

const report = []
for (const group of groups.values()) {
  const digits = group.phone.replace(/\D/g, '')
  const identity = run(`
    SELECT u.id AS user_id, u.email, u.phoneNumberVerified AS phone_verified,
           m.id AS member_id, m.role
    FROM user u LEFT JOIN member m ON m.userId = u.id AND m.organizationId = '${q(group.organizationId)}'
    WHERE u.phoneNumber = '${q(group.phone)}' LIMIT 1
  `)[0] ?? null
  const email = identity?.email || `phone-${digits}@phone.krabiclaw.local`
  const pending = run(`SELECT id FROM invitation WHERE organizationId = '${q(group.organizationId)}' AND lower(email) = lower('${q(email)}') AND status = 'pending' AND expiresAt > unixepoch() ORDER BY createdAt DESC LIMIT 1`)[0] ?? null
  const existingScopes = identity?.member_id ? run(`SELECT site_id, location_id FROM member_access_scope WHERE member_id = '${q(identity.member_id)}' ORDER BY site_id, location_id`) : []
  const pendingScopes = pending ? run(`SELECT site_id, location_id FROM invitation_access_scope WHERE invitation_id = '${q(pending.id)}' ORDER BY site_id, location_id`) : []
  const active = identity?.member_id && ['owner', 'admin', 'editor', 'member', 'location_manager'].includes(identity.role)
  const action = active ? (identity.role === 'member' ? 'promote_member_and_ensure_scopes' : 'ensure_scopes') : pending ? 'reuse_invitation' : 'create_invitation'
  const item = { ...group, identity, existingScopes, pendingInvitationId: pending?.id ?? null, pendingScopes, proposedAction: action }
  report.push(item)
  if (!args.includes('--apply')) continue

  if (active) {
    if (identity.role === 'member') run(`UPDATE member SET role = 'location_manager' WHERE id = '${q(identity.member_id)}'`)
    if (!['owner', 'admin'].includes(identity.role)) {
      for (const scope of group.scopes) run(`INSERT OR IGNORE INTO member_access_scope (id, member_id, organization_id, site_id, location_id, created_at) VALUES ('${randomUUID()}', '${q(identity.member_id)}', '${q(group.organizationId)}', '${q(scope.siteId)}', ${scope.locationId ? `'${q(scope.locationId)}'` : 'NULL'}, datetime('now'))`)
    }
    continue
  }
  const inviter = run(`SELECT userId AS id FROM member WHERE organizationId = '${q(group.organizationId)}' AND role IN ('owner','admin') ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, createdAt LIMIT 1`)[0]
  if (!inviter) throw new Error(`No owner/admin inviter for ${group.organizationName}`)
  const invitationId = pending?.id ?? randomUUID()
  if (!pending) run(`INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt) VALUES ('${invitationId}', '${q(group.organizationId)}', '${q(email)}', 'location_manager', 'pending', unixepoch() + 604800, '${q(inviter.id)}', unixepoch())`)
  for (const scope of group.scopes) run(`INSERT OR IGNORE INTO invitation_access_scope (id, invitation_id, organization_id, site_id, location_id, created_at) VALUES ('${randomUUID()}', '${invitationId}', '${q(group.organizationId)}', '${q(scope.siteId)}', ${scope.locationId ? `'${q(scope.locationId)}'` : 'NULL'}, datetime('now'))`)
}

console.error(`WhatsApp access ${args.includes('--apply') ? 'apply' : 'dry-run'}: ${report.length} recipient(s)`)
for (const item of report) console.error(`- ${item.organizationName}: ${item.phone} → ${item.proposedAction} (${item.scopes.length} scope(s))`)
console.log(JSON.stringify({ target: args.find(flag => ['--local', '--staging', '--remote'].includes(flag)), baseUrl, mode: args.includes('--apply') ? 'apply' : 'dry-run', recipients: report }, null, 2))
