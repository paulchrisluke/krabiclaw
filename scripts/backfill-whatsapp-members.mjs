#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'

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
if (args.includes('--remote') && (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) && existsSync('.env')) process.loadEnvFile('.env')
const graphVersion = 'v25.0'
async function assertInvitationTemplateApproved() {
  const accountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!accountId || !token || !process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('Production apply requires WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_ACCESS_TOKEN')
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${accountId}/message_templates?name=dashboard_access_invitation&fields=name,status` , { headers: { Authorization: `Bearer ${token}` } })
  const data = await response.json()
  const template = data.data?.find(item => item.name === 'dashboard_access_invitation')
  if (!response.ok || template?.status !== 'APPROVED') throw new Error(`dashboard_access_invitation is not approved by Meta (status: ${template?.status || 'missing'})`)
}
async function sendAccessInvitation(phone, siteName, invitationId, siteId) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'template', template: {
      name: 'dashboard_access_invitation', language: { code: 'en_US' }, components: [
        { type: 'body', parameters: [{ type: 'text', text: siteName }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `${encodeURIComponent(invitationId)}?siteId=${encodeURIComponent(siteId)}` }] },
      ],
    } }),
  })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error?.message || `WhatsApp invitation send failed (${response.status})`)
  return data.messages?.[0]?.id ?? null
}
if (args.includes('--remote') && args.includes('--apply')) await assertInvitationTemplateApproved()
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
  const pending = run(`SELECT id, role FROM invitation WHERE organizationId = '${q(group.organizationId)}' AND lower(email) = lower('${q(email)}') AND status = 'pending' ORDER BY createdAt DESC LIMIT 1`)[0] ?? null
  const existingScopes = identity?.member_id ? run(`SELECT site_id, location_id FROM member_access_scope WHERE member_id = '${q(identity.member_id)}' ORDER BY site_id, location_id`) : []
  const pendingScopes = pending ? run(`SELECT site_id, location_id FROM invitation_access_scope WHERE invitation_id = '${q(pending.id)}' ORDER BY site_id, location_id`) : []
  const active = identity?.member_id && ['owner', 'admin', 'editor', 'location_manager'].includes(identity.role)
  const unsupportedMember = identity?.member_id && !active
  const unsupportedPending = !active && pending && pending.role !== 'location_manager'
  const action = unsupportedMember ? `reject_non_operational_role:${identity.role}` : unsupportedPending ? `reject_incompatible_invitation_role:${pending.role || 'unset'}` : active ? 'ensure_scopes' : pending ? 'reuse_invitation' : 'create_invitation'
  const item = { ...group, identity, email, pending, active, unsupportedMember, unsupportedPending, existingScopes, pendingInvitationId: pending?.id ?? null, pendingScopes, proposedAction: action }
  report.push(item)
}

const unsupported = report.filter(item => item.unsupportedMember || item.unsupportedPending)
if (unsupported.length > 0) {
  throw new Error(`Unsupported WhatsApp access state: ${unsupported.map(item => `${item.organizationName} (${item.proposedAction})`).join(', ')}`)
}

if (args.includes('--apply')) {
for (const item of report) {
  const { identity, active, pending, email } = item

  if (active) {
    if (!['owner', 'admin'].includes(identity.role)) {
      for (const scope of item.scopes) run(`INSERT OR IGNORE INTO member_access_scope (id, member_id, organization_id, site_id, location_id, created_at) VALUES ('${randomUUID()}', '${q(identity.member_id)}', '${q(item.organizationId)}', '${q(scope.siteId)}', ${scope.locationId ? `'${q(scope.locationId)}'` : 'NULL'}, datetime('now'))`)
    }
    continue
  }
  const inviter = run(`SELECT userId AS id FROM member WHERE organizationId = '${q(item.organizationId)}' AND role IN ('owner','admin') ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, createdAt LIMIT 1`)[0]
  if (!inviter) throw new Error(`No owner/admin inviter for ${item.organizationName}`)
  const invitationId = pending?.id ?? randomUUID()
  const createdInvitation = !pending
  if (!pending) run(`INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt) VALUES ('${invitationId}', '${q(item.organizationId)}', '${q(email)}', 'location_manager', 'pending', unixepoch() + 604800, '${q(inviter.id)}', unixepoch())`)
  else run(`UPDATE invitation SET expiresAt = unixepoch() + 604800 WHERE id = '${q(invitationId)}'`)
  for (const scope of item.scopes) run(`INSERT OR IGNORE INTO invitation_access_scope (id, invitation_id, organization_id, site_id, location_id, created_at) VALUES ('${randomUUID()}', '${invitationId}', '${q(item.organizationId)}', '${q(scope.siteId)}', ${scope.locationId ? `'${q(scope.locationId)}'` : 'NULL'}, datetime('now'))`)
  item.pendingInvitationId = invitationId
  item.invitationUrl = `${baseUrl}/accept-invitation/${encodeURIComponent(invitationId)}?siteId=${encodeURIComponent(item.scopes[0].siteId)}`
  if (args.includes('--remote') && (createdInvitation || args.includes('--resend'))) {
    try {
      item.providerMessageId = await sendAccessInvitation(item.phone, item.organizationName, invitationId, item.scopes[0].siteId)
      run(`INSERT INTO notifications (id, organization_id, site_id, location_id, channel, template, recipient, payload, status, provider_message_id, sent_at, created_at) VALUES ('${randomUUID()}', '${q(item.organizationId)}', '${q(item.scopes[0].siteId)}', ${item.scopes[0].locationId ? `'${q(item.scopes[0].locationId)}'` : 'NULL'}, 'whatsapp', 'dashboard_access_invitation', '${q(item.phone)}', '${q(JSON.stringify({ invitationId }))}', 'sent', ${item.providerMessageId ? `'${q(item.providerMessageId)}'` : 'NULL'}, datetime('now'), datetime('now'))`)
    } catch (error) {
      if (createdInvitation) run(`DELETE FROM invitation WHERE id = '${q(invitationId)}'`)
      throw error
    }
  }
}
}

console.error(`WhatsApp access ${args.includes('--apply') ? 'apply' : 'dry-run'}: ${report.length} recipient(s)`)
for (const item of report) console.error(`- ${item.organizationName}: ${item.phone} → ${item.proposedAction} (${item.scopes.length} scope(s))`)
console.log(JSON.stringify({ target: args.find(flag => ['--local', '--staging', '--remote'].includes(flag)), baseUrl, mode: args.includes('--apply') ? 'apply' : 'dry-run', recipients: report }, null, 2))
