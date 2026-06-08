#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const SITE_ID = 'site-pottery-house'
const FREE_SUBDOMAIN_ID = 'domain-pottery-prod'
const CUSTOM_DOMAIN_ID = 'dom-pottery-www'
const TRANSFER_EMAIL = 'thesdrew@gmail.com'
const APPLY = process.argv.includes('--apply')

function runWranglerJson(sql) {
  const output = execFileSync(
    'yarn',
    ['wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )

  const start = output.indexOf('[')
  const end = output.lastIndexOf(']')
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse Wrangler JSON output.\n${output}`)
  }

  const parsed = JSON.parse(output.slice(start, end + 1))
  if (!Array.isArray(parsed) || !parsed[0]?.success) {
    throw new Error(`Wrangler query failed.\n${output}`)
  }

  return parsed[0]
}

function runWrangler(sql) {
  execFileSync(
    'yarn',
    ['wrangler', 'd1', 'execute', 'DB', '--remote', '--command', sql],
    { stdio: 'inherit' },
  )
}

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function eventId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function loadState() {
  const domains = runWranglerJson(`
    SELECT id, organization_id, site_id, domain, type, role, status, cloudflare_hostname_id, updated_at
    FROM site_domains
    WHERE site_id = ${q(SITE_ID)}
    ORDER BY created_at ASC;
  `).results

  const transfers = runWranglerJson(`
    SELECT id, site_id, from_organization_id, to_email, status, completed_at, invited_plan, invited_domain, created_at
    FROM site_transfer_requests
    WHERE site_id = ${q(SITE_ID)}
    ORDER BY created_at DESC;
  `).results

  const site = runWranglerJson(`
    SELECT id, organization_id, public_url, custom_domain, custom_domain_status, subdomain, status, onboarding_status
    FROM sites
    WHERE id = ${q(SITE_ID)}
    LIMIT 1;
  `).results[0]

  return { domains, transfers, site }
}

function assertExpectedState(state) {
  if (!state.site) throw new Error(`Site not found: ${SITE_ID}`)

  const customDomain = state.domains.find((row) => row.id === CUSTOM_DOMAIN_ID)
  if (!customDomain) throw new Error(`Custom domain row not found: ${CUSTOM_DOMAIN_ID}`)
  if (customDomain.domain !== 'www.potteryhousekrabi.com') {
    throw new Error(`Unexpected custom domain hostname: ${customDomain.domain}`)
  }

  const freeSubdomain = state.domains.find((row) => row.id === FREE_SUBDOMAIN_ID)
  if (!freeSubdomain) throw new Error(`Free subdomain row not found: ${FREE_SUBDOMAIN_ID}`)
  if (freeSubdomain.domain !== 'pottery-house.krabiclaw.com') {
    throw new Error(`Unexpected free subdomain hostname: ${freeSubdomain.domain}`)
  }

  const pendingTransfers = state.transfers.filter(
    (row) => row.to_email === TRANSFER_EMAIL && row.status === 'pending',
  )
  if (pendingTransfers.length === 0) {
    throw new Error(`No pending transfer row for ${TRANSFER_EMAIL} found`)
  }
  if (pendingTransfers.length > 1) {
    throw new Error(`Multiple pending transfer rows for ${TRANSFER_EMAIL} found — refusing to guess which one to reset (ids: ${pendingTransfers.map((row) => row.id).join(', ')})`)
  }
  const transfer = pendingTransfers[0]

  return { customDomain, freeSubdomain, transfer }
}

function redactTransfer(row) {
  return {
    ...row,
    to_email: row.to_email ? row.to_email.replace(/^(.).*(@.*)$/, '$1***$2') : row.to_email,
    invited_domain: row.invited_domain ? '<redacted>' : row.invited_domain,
  }
}

function printState(label, state) {
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify({
    site: state.site,
    domains: state.domains,
    transfers: state.transfers.map(redactTransfer),
  }, null, 2))
}

function buildApplySql({ customDomain, freeSubdomain, transfer, site }) {
  const now = new Date().toISOString()
  const domainDeletedEventId = eventId('dom-event')
  const canonicalEventId = eventId('dom-event')

  return `
    UPDATE site_domains
    SET status = 'deleted',
        role = 'secondary',
        error_message = COALESCE(error_message, 'Pottery House unpaid handoff cutoff applied on ${now}'),
        updated_at = ${q(now)}
    WHERE id = ${q(customDomain.id)}
      AND site_id = ${q(SITE_ID)};

    DELETE FROM domain_reconciliation_jobs
    WHERE domain_id = ${q(customDomain.id)};

    UPDATE site_domains
    SET role = 'secondary',
        updated_at = ${q(now)}
    WHERE site_id = ${q(SITE_ID)}
      AND role = 'canonical';

    UPDATE site_domains
    SET role = 'canonical',
        status = 'active',
        updated_at = ${q(now)}
    WHERE id = ${q(freeSubdomain.id)}
      AND site_id = ${q(SITE_ID)};

    UPDATE sites
    SET public_url = ${q(`https://${freeSubdomain.domain}`)},
        custom_domain = NULL,
        custom_domain_status = NULL,
        updated_at = ${q(now)}
    WHERE id = ${q(site.id)}
      AND organization_id = ${q(site.organization_id)};

    UPDATE site_transfer_requests
    SET status = 'pending',
        completed_at = NULL
    WHERE id = ${q(transfer.id)};

    INSERT INTO site_domain_events (
      id, organization_id, site_id, domain_id, event_type, actor_type, message, metadata, created_at
    ) VALUES (
      ${q(domainDeletedEventId)},
      ${q(customDomain.organization_id)},
      ${q(SITE_ID)},
      ${q(customDomain.id)},
      'domain_deleted',
      'system',
      ${q(`${customDomain.domain} deleted for unpaid Pottery House handoff`)},
      ${q(JSON.stringify({
        reason: 'unpaid_pottery_house_handoff_cutoff',
        cloudflare_hostname_id: customDomain.cloudflare_hostname_id || null,
        transfer_id: transfer.id,
      }))},
      ${q(now)}
    );

    INSERT INTO site_domain_events (
      id, organization_id, site_id, domain_id, event_type, actor_type, message, metadata, created_at
    ) VALUES (
      ${q(canonicalEventId)},
      ${q(freeSubdomain.organization_id)},
      ${q(SITE_ID)},
      ${q(freeSubdomain.id)},
      'canonical_domain_changed',
      'system',
      ${q(`${freeSubdomain.domain} set as primary after unpaid Pottery House handoff cutoff`)},
      ${q(JSON.stringify({
        reason: 'unpaid_pottery_house_handoff_cutoff',
        replaced_domain_id: customDomain.id,
        transfer_id: transfer.id,
      }))},
      ${q(now)}
    );
  `
}

const before = loadState()
printState('Before', before)

const expected = assertExpectedState(before)

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to enforce the Pottery House cutoff.')
  process.exit(0)
}

runWrangler(buildApplySql({ ...expected, site: before.site }))

const after = loadState()
printState('After', after)
