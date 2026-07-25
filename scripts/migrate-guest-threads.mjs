#!/usr/bin/env -S node --experimental-strip-types
// One-time backfill for issue #442's guest-thread rewrite: migrates every existing
// guest_threads row onto the new canonical ledger (guest_thread_entries), operational/
// conversation-state projection, and per-member read state (guest_thread_member_state).
//
// For each guest_threads row, sequentially (each row's writes depend on that row's own
// reads — see CLAUDE.md's D1-no-raw-transactions rule):
//   1. load the source submission (contact/reservation/experience_booking) via the same
//      adapter query shape as server/domain/guest-threads/adapters/*.ts;
//   2. insert an immutable opening `submission` entry using the source's original
//      created_at (never "now");
//   3. migrate every submission_messages row for that thread into ordered `message`
//      entries, preserving id/direction/channel/body/sender/status/error/timestamp;
//   4. backfill operational_status from the current source status;
//   5. apply the 5-rule conversation-state backfill cascade below;
//   6. insert one `migration_snapshot` operation entry (actor_kind system) recording only
//      the current state, never inventing historical confirm/cancel timestamps;
//   7. seed guest_thread_member_state for every currently authorized member from
//      owner_last_seen_at (a null owner_last_seen_at seeds a null cursor — "never read" is
//      preserved, not invented as read).
//
// Usage: node scripts/migrate-guest-threads.mjs --local|--staging|--remote --dry-run|--apply
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const args = process.argv.slice(2)
const targetCount = ['--local', '--staging', '--remote'].filter(flag => args.includes(flag)).length
if (targetCount !== 1 || (!args.includes('--dry-run') && !args.includes('--apply'))) {
  console.error('Usage: node scripts/migrate-guest-threads.mjs --local|--staging|--remote --dry-run|--apply')
  process.exit(1)
}
const apply = args.includes('--apply')
const targetArgs = args.includes('--staging') ? ['--env', 'staging', '--remote'] : args.includes('--remote') ? ['--remote'] : ['--local']
if (args.includes('--remote') && apply && !args.includes('--confirm-production')) {
  console.error('Refusing production writes without --confirm-production.')
  process.exit(1)
}

const q = value => (value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`)

function run(sql) {
  const result = spawnSync('node_modules/.bin/wrangler', ['d1', 'execute', 'DB', ...targetArgs, '--command', sql, '--json'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim())
  const parsed = JSON.parse(result.stdout || '[]')
  return parsed.flatMap(entry => entry.results ?? entry.result?.[0]?.results ?? [])
}

function exec(sql) {
  if (!apply) return
  run(sql)
}

const SOURCE_QUERIES = {
  contact: (id) => `
    SELECT ct.id, ct.organization_id, ct.site_id, COALESCE(ct.location_id, e.location_id) AS location_id,
           ct.name, ct.email, ct.subject, ct.message, ct.status, ct.created_at,
           bl.title AS location_title, e.title AS experience_title
    FROM contact_submissions ct
    LEFT JOIN experiences e ON e.id = ct.experience_id
    LEFT JOIN business_locations bl ON bl.id = COALESCE(ct.location_id, e.location_id)
    WHERE ct.id = ${q(id)} LIMIT 1
  `,
  reservation: (id) => `
    SELECT rs.id, rs.organization_id, rs.site_id, rs.location_id, rs.name, rs.email, rs.phone,
           rs.date, rs.time, rs.guests, rs.requests, rs.status, rs.created_at,
           bl.title AS location_title
    FROM reservation_submissions rs
    LEFT JOIN business_locations bl ON bl.id = rs.location_id
    WHERE rs.id = ${q(id)} LIMIT 1
  `,
  experience_booking: (id) => `
    SELECT eb.id, eb.organization_id, eb.site_id, eb.location_id, eb.guest_name, eb.guest_email, eb.guest_phone,
           eb.booking_date, eb.time_slot, eb.party_size, eb.notes, eb.status, eb.created_at,
           bl.title AS location_title, e.title AS experience_title
    FROM experience_bookings eb
    LEFT JOIN business_locations bl ON bl.id = eb.location_id
    LEFT JOIN experiences e ON e.id = eb.experience_id
    WHERE eb.id = ${q(id)} LIMIT 1
  `,
}

function buildOpeningSnapshot(type, source) {
  if (type === 'contact') {
    return {
      schemaVersion: 1, submissionType: 'contact', submissionId: source.id,
      guestName: source.name, guestEmail: source.email, subject: source.subject,
      message: source.message, locationTitle: source.location_title,
      experienceTitle: source.experience_title, submittedAt: source.created_at,
    }
  }
  if (type === 'reservation') {
    return {
      schemaVersion: 1, submissionType: 'reservation', submissionId: source.id,
      guestName: source.name, guestEmail: source.email, guestPhone: source.phone,
      locationTitle: source.location_title, date: source.date, time: source.time,
      guests: source.guests, requests: source.requests, submittedAt: source.created_at,
    }
  }
  return {
    schemaVersion: 1, submissionType: 'experience_booking', submissionId: source.id,
    guestName: source.guest_name, guestEmail: source.guest_email, guestPhone: source.guest_phone,
    locationTitle: source.location_title, experienceTitle: source.experience_title,
    bookingDate: source.booking_date, timeSlot: source.time_slot, partySize: source.party_size,
    notes: source.notes, submittedAt: source.created_at,
  }
}

// 5-rule conversation-state backfill cascade (issue #442):
//   1. old closed -> resolved
//   2. unread or latest-inbound-newer-than-latest-outbound -> needs_attention
//   3. latest-outbound-newer-than-latest-inbound -> waiting_on_guest
//   4. no messages and actionable new/pending source -> needs_attention
//   5. terminal source with no newer inbound -> resolved
function backfillConversationState(thread, messages, operationalStatus) {
  if (thread.inbox_status === 'closed') return 'resolved'

  const inbound = messages.filter(m => m.direction === 'in')
  const outbound = messages.filter(m => m.direction === 'out')
  const latestInbound = inbound.length ? inbound.reduce((a, b) => (a.created_at > b.created_at ? a : b)) : null
  const latestOutbound = outbound.length ? outbound.reduce((a, b) => (a.created_at > b.created_at ? a : b)) : null

  const unread = thread.unread_count > 0
  if (unread || (latestInbound && (!latestOutbound || latestInbound.created_at > latestOutbound.created_at))) {
    return 'needs_attention'
  }
  if (latestOutbound && (!latestInbound || latestOutbound.created_at > latestInbound.created_at)) {
    return 'waiting_on_guest'
  }

  const actionableStatuses = new Set(['new', 'pending'])
  if (messages.length === 0 && actionableStatuses.has(operationalStatus)) {
    return 'needs_attention'
  }

  const terminalStatuses = new Set(['completed', 'cancelled'])
  if (terminalStatuses.has(operationalStatus) && !latestInbound) {
    return 'resolved'
  }

  // Default: anything left over (e.g. a confirmed reservation with no messages at all)
  // still needs a human decision — treat as needs_attention rather than silently resolved.
  return 'needs_attention'
}

function authorizedMembersSql(organizationId, siteTeamId, locationTeamId) {
  return `
    SELECT DISTINCT m.id AS member_id
    FROM member m
    WHERE m.organizationId = ${q(organizationId)}
      AND (
        m.role IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1 FROM teamMember tm
          WHERE tm.userId = m.userId
            AND tm.teamId IN (${q(siteTeamId)}${locationTeamId ? `, ${q(locationTeamId)}` : ''})
        )
      )
  `
}

console.log(`[migrate-guest-threads] target=${targetArgs.join(' ')} mode=${apply ? 'apply' : 'dry-run'}`)

// This script only makes sense between migration 0067 (additive ledger tables) and 0068
// (drops the legacy inbox_status/unread_count/owner_last_seen_at columns + submission_messages
// table it reads from). Running it after 0068 has already been applied would fail with a
// confusing "no such column" SQLite error deep in the first query below — fail fast with a
// clear message instead.
const guestThreadsColumns = run(`PRAGMA table_info(guest_threads)`)
const hasLegacyColumns = guestThreadsColumns.some(col => col.name === 'inbox_status')
if (!hasLegacyColumns) {
  console.error('[migrate-guest-threads] guest_threads no longer has legacy columns (inbox_status) — migration 0068 has already run against this target.')
  console.error('[migrate-guest-threads] This script must run after 0067 and before 0068. There is nothing left to migrate here.')
  process.exit(1)
}

const threads = run(`
  SELECT gt.id, gt.organization_id, gt.site_id, gt.location_id, gt.submission_type, gt.submission_id,
         gt.guest_name, gt.inbox_status, gt.unread_count, gt.owner_last_seen_at,
         s.team_id AS site_team_id, bl.team_id AS location_team_id
  FROM guest_threads gt
  JOIN sites s ON s.id = gt.site_id
  LEFT JOIN business_locations bl ON bl.id = gt.location_id
  ORDER BY gt.created_at ASC
`)

console.log(`[migrate-guest-threads] found ${threads.length} thread(s) to process`)

const stateCounts = { needs_attention: 0, waiting_on_guest: 0, resolved: 0 }
let openingEntriesCreated = 0
let openingEntriesSkipped = 0
let messagesMigrated = 0
let membersSeeded = 0

for (const thread of threads) {
  const sourceQuery = SOURCE_QUERIES[thread.submission_type]
  if (!sourceQuery) {
    console.warn(`[migrate-guest-threads] skipping thread ${thread.id}: unknown submission_type ${thread.submission_type}`)
    continue
  }
  const [source] = run(sourceQuery(thread.submission_id))
  if (!source) {
    console.warn(`[migrate-guest-threads] skipping thread ${thread.id}: source ${thread.submission_type}/${thread.submission_id} not found`)
    continue
  }

  const [{ count: existingOpeningCount } = { count: 0 }] = run(`
    SELECT COUNT(*) AS count FROM guest_thread_entries WHERE thread_id = ${q(thread.id)} AND kind = 'submission'
  `)

  const now = new Date().toISOString()

  if (Number(existingOpeningCount) === 0) {
    const snapshot = buildOpeningSnapshot(thread.submission_type, source)
    exec(`
      INSERT INTO guest_thread_entries
        (id, thread_id, organization_id, site_id, kind, actor_kind, channel, body, event_name, payload_json, occurred_at, created_at)
      VALUES (${q(randomUUID())}, ${q(thread.id)}, ${q(thread.organization_id)}, ${q(thread.site_id)}, 'submission', 'guest', 'system',
              NULL, ${q(`${thread.submission_type}_submitted`)}, ${q(JSON.stringify(snapshot))}, ${q(source.created_at)}, ${q(now)})
    `)
    openingEntriesCreated += 1
  } else {
    openingEntriesSkipped += 1
  }

  const messages = run(`
    SELECT id, direction, channel, body, sender_user_id, meta_message_id, status, error, created_at
    FROM submission_messages
    WHERE thread_id = ${q(thread.id)}
    ORDER BY created_at ASC
  `)

  for (const message of messages) {
    const [{ count: existingMessageCount } = { count: 0 }] = run(`
      SELECT COUNT(*) AS count FROM guest_thread_entries WHERE id = ${q(message.id)}
    `)
    if (Number(existingMessageCount) > 0) continue

    exec(`
      INSERT INTO guest_thread_entries
        (id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body, payload_json, occurred_at, created_at)
      VALUES (
        ${q(message.id)}, ${q(thread.id)}, ${q(thread.organization_id)}, ${q(thread.site_id)}, 'message',
        ${q(message.direction === 'in' ? 'guest' : 'member')}, ${q(message.sender_user_id)}, ${q(message.channel)},
        ${q(message.body)},
        ${q(JSON.stringify({ status: message.status, error: message.error, metaMessageId: message.meta_message_id }))},
        ${q(message.created_at)}, ${q(now)}
      )
    `)
    messagesMigrated += 1
  }

  const conversationState = backfillConversationState(thread, messages, source.status)
  stateCounts[conversationState] += 1

  exec(`
    UPDATE guest_threads
    SET operational_status = ${q(source.status)},
        conversation_state = ${q(conversationState)},
        resolved_at = ${conversationState === 'resolved' ? q(now) : 'NULL'},
        updated_at = ${q(now)}
    WHERE id = ${q(thread.id)}
  `)

  if (Number(existingOpeningCount) === 0) {
    exec(`
      INSERT INTO guest_thread_entries
        (id, thread_id, organization_id, site_id, kind, actor_kind, event_name, payload_json, occurred_at, created_at)
      VALUES (${q(randomUUID())}, ${q(thread.id)}, ${q(thread.organization_id)}, ${q(thread.site_id)}, 'operation', 'system',
              'migration_snapshot', ${q(JSON.stringify({ operationalStatus: source.status, conversationState, migratedAt: now }))}, ${q(now)}, ${q(now)})
    `)
  }

  const authorizedMembers = run(authorizedMembersSql(thread.organization_id, thread.site_team_id, thread.location_team_id))
  for (const { member_id: memberId } of authorizedMembers) {
    const [{ count: existingCursorCount } = { count: 0 }] = run(`
      SELECT COUNT(*) AS count FROM guest_thread_member_state WHERE thread_id = ${q(thread.id)} AND member_id = ${q(memberId)}
    `)
    if (Number(existingCursorCount) > 0) continue

    // A null owner_last_seen_at means "never read" — preserved as a null cursor, not
    // invented as read.
    exec(`
      INSERT INTO guest_thread_member_state (thread_id, member_id, last_read_entry_id, last_read_at, created_at, updated_at)
      VALUES (${q(thread.id)}, ${q(memberId)}, NULL, ${q(thread.owner_last_seen_at)}, ${q(now)}, ${q(now)})
    `)
    membersSeeded += 1
  }
}

console.log('[migrate-guest-threads] summary:')
console.log(`  threads processed: ${threads.length}`)
console.log(`  opening entries created: ${openingEntriesCreated} (skipped, already present: ${openingEntriesSkipped})`)
console.log(`  messages migrated: ${messagesMigrated}`)
console.log(`  member cursors seeded: ${membersSeeded}`)
console.log(`  conversation_state assignments: ${JSON.stringify(stateCounts)}`)
if (!apply) {
  console.log('[migrate-guest-threads] dry-run only — no writes were made. Re-run with --apply to persist.')
}
