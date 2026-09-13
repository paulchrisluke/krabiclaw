#!/usr/bin/env node
/**
 * Restores what the catalog epoch dropped from the NCLS practice-area pages.
 *
 * Two fields did not survive offerings → content_documents (#919, measured
 * 2026-09-12 on production-v1):
 *
 * - `offerings.features[].icon` — every feature grid item lost its icon, so
 *   BlawbyFeatureIcon renders nothing on all six service pages. The names
 *   below are the archived export's, keyed by the item title they belonged to.
 * - `contact_cta` blocks were written with a title and label and no `url`, so
 *   the consultation button never renders (the block validator requires the
 *   pair). The site's consultation page is /schedule.
 *
 * Data only: no schema change, so this is not a migration (see CLAUDE.md).
 * Idempotent — an item that already has an icon, or a CTA that already has a
 * URL, is left alone — and it reports anything it cannot map instead of
 * guessing.
 *
 * Usage:
 *   node scripts/repair-ncls-service-pages.mjs --local
 *   node scripts/repair-ncls-service-pages.mjs --env staging
 *   node scripts/repair-ncls-service-pages.mjs --env production
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')
const WRANGLER_BIN = join(ROOT, 'node_modules', '.bin', 'wrangler')
const SITE_SUBDOMAIN = 'ncls'
const CONSULTATION_PATH = '/schedule'

/** Feature title → heroicon name, per practice-area slug, from the archived offerings export. */
const ICONS = {
  "family": {
    "Alimony": "CurrencyDollarIcon",
    "Child Custody and Visitation": "UserGroupIcon",
    "Child Support": "CurrencyDollarIcon",
    "Custodial Power of Attorney": "DocumentTextIcon",
    "Divorce": "ClipboardDocumentCheckIcon",
    "Third-Party Custody": "ShieldCheckIcon",
    "Prenuptial Agreements": "DocumentTextIcon",
    "Separation Agreements": "UserIcon",
    "Equitable Distribution": "ScaleIcon",
    "Domestic Violence Protective Orders (DVPO)": "ShieldExclamationIcon",
    "Visitation": "UserGroupIcon",
    "Child Support Modifications": "AdjustmentsHorizontalIcon",
    "Custody Evaluations": "ClipboardDocumentListIcon",
    "Enforcement of Court Orders": "CheckIcon",
    "Mediation Services": "ChatBubbleBottomCenterTextIcon"
  },
  "small-business-and-nonprofits": {
    "Arbitration/Mediation": "ScaleIcon",
    "Business Entity Formation": "BuildingOffice2Icon",
    "Compliance": "ClipboardIcon",
    "Commercial Litigation": "ChatBubbleBottomCenterTextIcon",
    "Contracts": "DocumentTextIcon",
    "Employment Law": "BriefcaseIcon",
    "Nonprofit Formation and Governance": "UserGroupIcon",
    "Partnership Agreements": "BriefcaseIcon",
    "Real Estate Transactions": "BuildingOfficeIcon",
    "Risk Management": "ShieldCheckIcon",
    "Shareholder Agreements": "DocumentCheckIcon",
    "Child Support Modifications": "CurrencyDollarIcon",
    "Taxation": "CurrencyDollarIcon",
    "Enforcement of Court Orders": "ChatBubbleBottomCenterTextIcon"
  },
  "employment": {
    "Breach of Employment Contract": "DocumentTextIcon",
    "Civil Rights Violations": "ExclamationCircleIcon",
    "Contract & Agreement Disputes": "DocumentCheckIcon",
    "Defamation and Damage to Reputation": "ShieldExclamationIcon",
    "Employee Benefits & Rights": "ClipboardDocumentCheckIcon",
    "Family and Medical Leave Act (FMLA) Violations": "CalendarIcon",
    "Harassment Claims": "ExclamationCircleIcon",
    "Military Leave and USERRA Rights": "ShieldCheckIcon",
    "Privacy Rights in the Workplace": "LockClosedIcon",
    "Retaliation & Whistleblower Claims": "ExclamationTriangleIcon",
    "Union Rights and Collective Bargaining": "UserGroupIcon",
    "Wage & Hour Disputes": "CurrencyDollarIcon",
    "Workers Compensation Claims": "BriefcaseIcon",
    "Workplace Safety and OSHA Violations": "ShieldExclamationIcon",
    "Wrongful Termination": "XCircleIcon"
  },
  "tenant-rights": {
    "Eviction Defense": "ShieldExclamationIcon",
    "Housing Discrimination": "ExclamationCircleIcon",
    "Illegal Landlord Practices": "ExclamationTriangleIcon",
    "Lease Review": "DocumentTextIcon",
    "Lease Termination": "ClipboardDocumentCheckIcon",
    "Maintenance and Repair Advocacy": "WrenchIcon",
    "Quiet Enjoyment Violations": "UserGroupIcon",
    "Rent Overcharge & Deposit Disputes": "CurrencyDollarIcon",
    "Retaliatory Eviction ": "ShieldCheckIcon",
    "Roommate Disputes": "ChatBubbleLeftRightIcon",
    "Tenant Harassment": "ExclamationTriangleIcon",
    "Tenant Union Support": "UsersIcon",
    "Unlawful Rent Increases": "AdjustmentsHorizontalIcon",
    "Utility Shutoff Protection": "PowerIcon"
  },
  "probate-and-estate": {
    "Asset Protection": "ShieldCheckIcon",
    "Elder Law": "UserGroupIcon",
    "Estate Planning": "ClipboardDocumentListIcon",
    "Financial Powers of Attorney": "DocumentTextIcon",
    "Guardianships": "ShieldCheckIcon",
    "Living Wills": "DocumentTextIcon",
    "Medical Powers of Attorney": "UserGroupIcon",
    "Probate": "ClipboardDocumentCheckIcon",
    "Trusts": "LockClosedIcon",
    "Wills": "DocumentTextIcon"
  },
  "special-education-and-iep-advocacy": {
    "IEP Process Support and Advocacy": "DocumentTextIcon",
    "Representation at IEP Meetings": "UserGroupIcon",
    "State Complaint Filing and Advocacy": "ExclamationCircleIcon",
    "Due Process Hearings": "BalanceScaleIcon",
    "Section 504 Plan Development and Compliance": "ClipboardDocumentCheckIcon",
    "Resolution Meetings and Mediation": "HandshakeIcon",
    "Why Choose NCLS for Special Education Advocacy?": "StarIcon"
  }
}

function readOption(name) {
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
// environment is addressed through wrangler's --env flag.
const target = local ? ['--local'] : [...(environment === 'production' ? [] : ['--env', environment]), '--remote']

function d1(sql) {
  const result = spawnSync(WRANGLER_BIN, ['d1', 'execute', 'DB', ...target, '--json', '--command', sql], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: join(tmpdir(), 'krabiclaw-wrangler-logs') },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Wrangler failed for: ${sql.slice(0, 120)}`)
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('['))).flatMap(entry => entry.results ?? [])
}

const sqlString = value => `'${String(value).replace(/'/g, "''")}'`

const blocks = d1(`SELECT b.id, b.type, b.data_json, d.path FROM content_blocks b
  JOIN content_documents d ON d.id = b.document_id
  JOIN sites s ON s.id = d.site_id
 WHERE s.subdomain = ${sqlString(SITE_SUBDOMAIN)} AND d.path LIKE '/services/%' AND b.type IN ('feature_grid', 'contact_cta')`)

let iconsSet = 0, ctasSet = 0
const unmapped = []
for (const block of blocks) {
  const slug = block.path.replace('/services/', '')
  const data = JSON.parse(block.data_json)
  let changed = false
  if (block.type === 'feature_grid') {
    const map = ICONS[slug]
    if (!map) { unmapped.push(`${block.path}: no icon map for this page`); continue }
    for (const item of data.items ?? []) {
      if (item.icon) continue
      const icon = map[item.title]
      if (!icon) { unmapped.push(`${block.path}: "${item.title}" has no archived icon`); continue }
      item.icon = icon
      iconsSet += 1
      changed = true
    }
  }
  if (block.type === 'contact_cta' && !data.url) {
    data.url = CONSULTATION_PATH
    ctasSet += 1
    changed = true
  }
  if (changed) d1(`UPDATE content_blocks SET data_json = ${sqlString(JSON.stringify(data))}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${sqlString(block.id)}`)
}

console.log(`Blocks read: ${blocks.length}. Icons set: ${iconsSet}. CTA URLs set: ${ctasSet}.`)
if (unmapped.length) {
  console.error('Could not map:')
  for (const line of unmapped) console.error(`  ${line}`)
  process.exit(1)
}
