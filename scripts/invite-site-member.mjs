#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

function usage() {
  console.error(
    'Usage: node scripts/invite-site-member.mjs ' +
    '--email user@example.com ' +
    '--site-id site-pottery-house ' +
    '--inviter-email admin@example.com ' +
    '[--role admin|member|owner] ' +
    '[--local|--staging|--remote] ' +
    '[--resend] ' +
    '[--confirm-production]'
  )
  process.exit(1)
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag)
  if (index === -1) return null
  return args[index + 1] ?? null
}

function q(value) {
  return String(value).replace(/'/g, "''")
}

function buildInviteUrl(baseUrl, invitationId, siteId) {
  const url = new URL(`/accept-invitation/${invitationId}`, baseUrl)
  url.searchParams.set('siteId', siteId)
  return url.toString()
}

function runWranglerJson(targetArgs, sql) {
  const result = spawnSync(
    'yarn',
    ['wrangler', 'd1', 'execute', 'DB', ...targetArgs, '--command', sql, '--json'],
    { encoding: 'utf8' }
  )

  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || 'wrangler d1 execute failed').trim()
    throw new Error(message)
  }

  const raw = (result.stdout || '').trim()
  if (!raw) return []

  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || !parsed[0]?.results) {
    throw new Error(`Unexpected wrangler JSON response: ${raw}`)
  }

  return parsed[0].results
}

function detectTarget(args) {
  if (args.includes('--staging')) {
    return {
      wranglerArgs: ['--env', 'staging', '--remote'],
      baseUrl: 'https://staging.krabiclaw.com',
      label: 'staging',
      requiresProductionConfirmation: false,
    }
  }

  if (args.includes('--remote')) {
    return {
      wranglerArgs: ['--remote'],
      baseUrl: 'https://krabiclaw.com',
      label: 'production',
      requiresProductionConfirmation: true,
    }
  }

  return {
    wranglerArgs: ['--local'],
    baseUrl: 'http://localhost:3000',
    label: 'local',
    requiresProductionConfirmation: false,
  }
}

const args = process.argv.slice(2)
if (args.includes('--help')) usage()

const email = String(getArgValue(args, '--email') || '').trim().toLowerCase()
const siteId = String(getArgValue(args, '--site-id') || '').trim()
const inviterEmail = String(getArgValue(args, '--inviter-email') || '').trim().toLowerCase()
const role = String(getArgValue(args, '--role') || 'admin').trim().toLowerCase()
const resend = args.includes('--resend')

if (!email || !siteId || !inviterEmail) usage()
if (!['admin', 'member', 'owner'].includes(role)) {
  console.error(`Invalid role "${role}". Use admin, member, or owner.`)
  process.exit(1)
}

const target = detectTarget(args)
if (target.requiresProductionConfirmation && !args.includes('--confirm-production')) {
  console.error('Refusing to write a production invite without --confirm-production.')
  process.exit(1)
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!emailRegex.test(email) || !emailRegex.test(inviterEmail)) {
  console.error('Both --email and --inviter-email must be valid email addresses.')
  process.exit(1)
}

const siteRows = runWranglerJson(
  target.wranglerArgs,
  `
    SELECT s.id, s.subdomain, s.organization_id, o.slug AS organization_slug, o.name AS organization_name
    FROM sites s
    JOIN organization o ON o.id = s.organization_id
    WHERE s.id = '${q(siteId)}'
    LIMIT 1
  `
)

if (siteRows.length === 0) {
  console.error(`No site found for site id "${siteId}" on ${target.label}.`)
  process.exit(1)
}

const site = siteRows[0]

const inviterRows = runWranglerJson(
  target.wranglerArgs,
  `
    SELECT id, email, role
    FROM user
    WHERE lower(email) = '${q(inviterEmail)}'
    LIMIT 1
  `
)

if (inviterRows.length === 0) {
  console.error(`No inviter user found for "${inviterEmail}" on ${target.label}.`)
  process.exit(1)
}

const inviter = inviterRows[0]
if (!String(inviter.role || '').split(',').map(part => part.trim().toLowerCase()).includes('admin')) {
  console.error(`Inviter "${inviterEmail}" is not a platform admin on ${target.label}.`)
  process.exit(1)
}

const memberRows = runWranglerJson(
  target.wranglerArgs,
  `
    SELECT m.id, m.role, u.id AS user_id, u.email
    FROM member m
    JOIN user u ON u.id = m.userId
    WHERE m.organizationId = '${q(site.organization_id)}'
      AND lower(u.email) = '${q(email)}'
    LIMIT 1
  `
)

if (memberRows.length > 0) {
  const existingMember = memberRows[0]
  console.log(
    JSON.stringify(
      {
        success: false,
        reason: 'already_member',
        siteId: site.id,
        organizationId: site.organization_id,
        organizationSlug: site.organization_slug,
        email,
        existingRole: existingMember.role,
      },
      null,
      2
    )
  )
  process.exit(0)
}

const existingInviteRows = runWranglerJson(
  target.wranglerArgs,
  `
    SELECT id, email, role, status, expiresAt
    FROM invitation
    WHERE organizationId = '${q(site.organization_id)}'
      AND lower(email) = '${q(email)}'
      AND status = 'pending'
    ORDER BY createdAt DESC
    LIMIT 1
  `
)

const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
let invitationId

if (existingInviteRows.length > 0) {
  const existingInvite = existingInviteRows[0]

  if (!resend) {
    console.log(
      JSON.stringify(
        {
          success: false,
          reason: 'already_invited',
          siteId: site.id,
          organizationId: site.organization_id,
          organizationSlug: site.organization_slug,
          email,
          invitationId: existingInvite.id,
          inviteUrl: buildInviteUrl(target.baseUrl, existingInvite.id, site.id),
          existingRole: existingInvite.role,
        },
        null,
        2
      )
    )
    process.exit(0)
  }

  invitationId = String(existingInvite.id)
  runWranglerJson(
    target.wranglerArgs,
    `
      UPDATE invitation
      SET role = '${q(role)}',
          inviterId = '${q(inviter.id)}',
          expiresAt = ${expiresAt},
          status = 'pending'
      WHERE id = '${q(invitationId)}'
    `
  )
} else {
  invitationId = randomUUID()
  runWranglerJson(
    target.wranglerArgs,
    `
      INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
      VALUES (
        '${q(invitationId)}',
        '${q(site.organization_id)}',
        '${q(email)}',
        '${q(role)}',
        'pending',
        ${expiresAt},
        '${q(inviter.id)}',
        unixepoch()
      )
    `
  )
}

console.log(
  JSON.stringify(
    {
      success: true,
      siteId: site.id,
      siteSubdomain: site.subdomain,
      organizationId: site.organization_id,
      organizationSlug: site.organization_slug,
      organizationName: site.organization_name,
      email,
      role,
      invitationId,
      inviteUrl: buildInviteUrl(target.baseUrl, invitationId, site.id),
      environment: target.label,
      resent: existingInviteRows.length > 0,
    },
    null,
    2
  )
)
