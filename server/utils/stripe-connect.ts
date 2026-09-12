import { HTTPError } from 'nitro'
import type Stripe from 'stripe'
import { execute, queryFirst, type DbClient } from '~/server/db'

export type StripeConnectStatus =
  | 'creating'
  | 'creation_failed'
  | 'action_required'
  | 'pending_review'
  | 'restricted'
  | 'ready'

export type StripeCapabilityStatus = 'active' | 'pending' | 'restricted' | 'unsupported'

export interface StripeConnectRequirement {
  awaitingActionFrom: 'stripe' | 'user'
  deadlineStatus: 'currently_due' | 'eventually_due' | 'past_due'
  description: string
  errors: string[]
}

export interface StripeConnectedAccount {
  id: string
  organizationId: string
  stripeAccountId: string | null
  country: string
  livemode: boolean
  status: StripeConnectStatus
  cardPaymentsStatus: StripeCapabilityStatus | null
  requirements: StripeConnectRequirement[]
  stripeRefreshedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

interface StripeConnectedAccountRow {
  id: string
  organization_id: string
  stripe_account_id: string | null
  country: string
  livemode: number
  status: StripeConnectStatus
  card_payments_status: StripeCapabilityStatus | null
  requirements_json: string
  stripe_refreshed_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface StripeConnectProjection {
  reservationId: string
  organizationId: string
  stripeAccountId: string
  country: string
  livemode: boolean
  cardPaymentsStatus: StripeCapabilityStatus | null
  requirements: StripeConnectRequirement[]
  stripeRefreshedAt: string
}

function parseRequirements(value: string): StripeConnectRequirement[] {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) throw new Error('Stored Stripe Connect requirements are invalid')
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Stored Stripe Connect requirement is invalid')
    const requirement = item as Record<string, unknown>
    if (
      (requirement.awaitingActionFrom !== 'stripe' && requirement.awaitingActionFrom !== 'user')
      || (requirement.deadlineStatus !== 'currently_due' && requirement.deadlineStatus !== 'eventually_due' && requirement.deadlineStatus !== 'past_due')
      || typeof requirement.description !== 'string'
      || !Array.isArray(requirement.errors)
      || !requirement.errors.every(error => typeof error === 'string')
    ) throw new Error('Stored Stripe Connect requirement is invalid')
  }
  return parsed as StripeConnectRequirement[]
}

function mapConnectedAccount(row: StripeConnectedAccountRow): StripeConnectedAccount {
  return {
    id: row.id,
    organizationId: row.organization_id,
    stripeAccountId: row.stripe_account_id,
    country: row.country,
    livemode: Boolean(row.livemode),
    status: row.status,
    cardPaymentsStatus: row.card_payments_status,
    requirements: parseRequirements(row.requirements_json),
    stripeRefreshedAt: row.stripe_refreshed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function normalizeStripeConnectCountry(value: unknown): string {
  if (typeof value !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: 'Country is required' })
  const country = value.trim().toUpperCase()
  if (!/^[A-Z]{2}$/u.test(country)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Country must be an ISO 3166-1 alpha-2 code' })
  }
  return country
}

export function stripeLivemodeFromKey(secretKey: string): boolean {
  if (/^(?:sk|rk)_live_/u.test(secretKey)) return true
  if (/^(?:sk|rk)_test_/u.test(secretKey)) return false
  throw new Error('Stripe key mode cannot be determined')
}

export function buildStripeConnectOnboardingUrls(
  platformOrigin: string,
  organizationSlug: string,
): { returnUrl: string; refreshUrl: string } {
  let origin: URL
  try {
    origin = new URL(platformOrigin)
  } catch {
    throw new Error('Stripe Connect platform origin is invalid')
  }
  if (origin.protocol !== 'https:') throw new Error('Stripe Connect platform origin must use HTTPS')
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Stripe Connect platform origin must be an origin without credentials, path, query, or fragment')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(organizationSlug)) {
    throw new Error('Stripe Connect organization slug is invalid')
  }
  const returnUrl = new URL(`/dashboard/${organizationSlug}/settings/connect`, origin)
  returnUrl.searchParams.set('stripe_connect', 'returned')
  const refreshUrl = new URL('/api/dashboard/connect/refresh', origin)
  refreshUrl.searchParams.set('org', organizationSlug)
  return { returnUrl: returnUrl.toString(), refreshUrl: refreshUrl.toString() }
}

export function deriveStripeConnectStatus(input: {
  cardPaymentsStatus: StripeCapabilityStatus | null
  requirements: StripeConnectRequirement[]
}): Exclude<StripeConnectStatus, 'creating' | 'creation_failed'> {
  const userActionDue = input.requirements.some(requirement =>
    requirement.awaitingActionFrom === 'user'
    && (requirement.deadlineStatus === 'currently_due' || requirement.deadlineStatus === 'past_due'))
  if (userActionDue) return 'action_required'
  if (input.cardPaymentsStatus === 'active') return 'ready'
  if (input.cardPaymentsStatus === 'restricted' || input.cardPaymentsStatus === 'unsupported') return 'restricted'
  return 'pending_review'
}

export async function getStripeConnectedAccount(
  db: DbClient,
  organizationId: string,
): Promise<StripeConnectedAccount | null> {
  const row = await queryFirst<StripeConnectedAccountRow>(db, `
    SELECT id, organization_id, stripe_account_id, country, livemode, status,
           card_payments_status, requirements_json, stripe_refreshed_at,
           last_error, created_at, updated_at
    FROM stripe_connected_accounts
    WHERE organization_id = ?
    LIMIT 1
  `, [organizationId])
  return row ? mapConnectedAccount(row) : null
}

export async function getStripeConnectedAccountByStripeId(
  db: DbClient,
  stripeAccountId: string,
): Promise<StripeConnectedAccount | null> {
  const row = await queryFirst<StripeConnectedAccountRow>(db, `
    SELECT id, organization_id, stripe_account_id, country, livemode, status,
           card_payments_status, requirements_json, stripe_refreshed_at,
           last_error, created_at, updated_at
    FROM stripe_connected_accounts
    WHERE stripe_account_id = ?
    LIMIT 1
  `, [stripeAccountId])
  return row ? mapConnectedAccount(row) : null
}

export async function reserveStripeConnectedAccount(
  db: DbClient,
  input: { organizationId: string; country: string; livemode: boolean },
): Promise<StripeConnectedAccount> {
  const country = normalizeStripeConnectCountry(input.country)
  const now = new Date().toISOString()
  await execute(db, `
    INSERT OR IGNORE INTO stripe_connected_accounts
      (id, organization_id, country, livemode, status, requirements_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'creating', '[]', ?, ?)
  `, [crypto.randomUUID(), input.organizationId, country, input.livemode ? 1 : 0, now, now])
  const row = await getStripeConnectedAccount(db, input.organizationId)
  if (!row) throw new Error('Stripe Connect account reservation was not persisted')
  if (row.country !== country) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Stripe Connect country cannot be changed after onboarding starts' })
  }
  if (row.livemode !== input.livemode) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Stripe Connect account belongs to a different Stripe mode' })
  }
  return row
}

export async function markStripeConnectedAccountCreationFailed(
  db: DbClient,
  reservationId: string,
  message: string,
): Promise<void> {
  await execute(db, `
    UPDATE stripe_connected_accounts
    SET status = 'creation_failed', last_error = ?, updated_at = ?
    WHERE id = ? AND stripe_account_id IS NULL
  `, [message.slice(0, 1000), new Date().toISOString(), reservationId])
}

export async function projectStripeConnectedAccount(
  db: DbClient,
  input: StripeConnectProjection,
): Promise<StripeConnectedAccount> {
  const status = deriveStripeConnectStatus(input)
  const country = normalizeStripeConnectCountry(input.country)
  const updated = await execute(db, `
    UPDATE stripe_connected_accounts
    SET stripe_account_id = ?, status = ?, card_payments_status = ?,
        requirements_json = ?, stripe_refreshed_at = ?, last_error = NULL,
        updated_at = ?
    WHERE id = ? AND organization_id = ? AND country = ? AND livemode = ?
      AND (stripe_account_id IS NULL OR stripe_account_id = ?)
  `, [
    input.stripeAccountId,
    status,
    input.cardPaymentsStatus,
    JSON.stringify(input.requirements),
    input.stripeRefreshedAt,
    new Date().toISOString(),
    input.reservationId,
    input.organizationId,
    country,
    input.livemode ? 1 : 0,
    input.stripeAccountId,
  ])
  if (Number(updated.meta.changes) !== 1) throw new Error('Stripe Connect account projection did not match its reservation')
  const row = await getStripeConnectedAccount(db, input.organizationId)
  if (!row) throw new Error('Projected Stripe Connect account is missing')
  return row
}

function normalizeAccountRequirements(account: Stripe.V2.Core.Account): StripeConnectRequirement[] {
  const entries = account.requirements?.entries
  if (!entries) return []
  return entries.map(requirement => ({
    awaitingActionFrom: requirement.awaiting_action_from,
    deadlineStatus: requirement.minimum_deadline.status,
    description: requirement.description,
    errors: requirement.errors.map(error => error.description),
  }))
}

function accountProjection(
  reservation: StripeConnectedAccount,
  account: Stripe.V2.Core.Account,
  refreshedAt = new Date().toISOString(),
): StripeConnectProjection {
  const country = account.identity?.country
  if (!country) throw new Error(`Stripe account ${account.id} did not include its country`)
  const cardPaymentsStatus = account.configuration?.merchant?.capabilities?.card_payments?.status
  return {
    reservationId: reservation.id,
    organizationId: reservation.organizationId,
    stripeAccountId: account.id,
    country: normalizeStripeConnectCountry(country),
    livemode: account.livemode,
    cardPaymentsStatus: cardPaymentsStatus === undefined ? null : cardPaymentsStatus,
    requirements: normalizeAccountRequirements(account),
    stripeRefreshedAt: refreshedAt,
  }
}

const STRIPE_CONNECT_ACCOUNT_INCLUDE: Stripe.V2.Core.AccountRetrieveParams.Include[] = [
  'configuration.merchant',
  'identity',
  'requirements',
]

export async function refreshStripeConnectedAccount(
  db: DbClient,
  stripe: Stripe,
  connected: StripeConnectedAccount,
  stripeContext?: Stripe.V2.Core.EventNotification['context'],
): Promise<StripeConnectedAccount> {
  if (!connected.stripeAccountId) throw new Error('Stripe Connect account has not been created')
  const account = await stripe.v2.core.accounts.retrieve(connected.stripeAccountId, {
    include: STRIPE_CONNECT_ACCOUNT_INCLUDE,
  }, stripeContext === undefined ? {} : { stripeContext })
  return await projectStripeConnectedAccount(db, accountProjection(connected, account))
}

export async function ensureStripeConnectedAccount(
  db: DbClient,
  stripe: Stripe,
  input: {
    organizationId: string
    organizationName: string
    contactEmail: string
    country: string
    livemode: boolean
  },
): Promise<StripeConnectedAccount> {
  const reservation = await reserveStripeConnectedAccount(db, input)
  if (reservation.stripeAccountId) return await refreshStripeConnectedAccount(db, stripe, reservation)

  let account: Stripe.V2.Core.Account
  try {
    account = await stripe.v2.core.accounts.create({
      contact_email: input.contactEmail,
      display_name: input.organizationName,
      dashboard: 'express',
      identity: { country: reservation.country.toLowerCase() },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
      },
      defaults: {
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      },
      metadata: { krabiclaw_organization_id: input.organizationId },
      include: STRIPE_CONNECT_ACCOUNT_INCLUDE,
    }, { idempotencyKey: `krabiclaw-connect-account:express:${input.organizationId}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe account creation failed'
    await markStripeConnectedAccountCreationFailed(db, reservation.id, message)
    throw error
  }
  return await projectStripeConnectedAccount(db, accountProjection(reservation, account))
}

export async function createStripeConnectOnboardingLink(
  stripe: Stripe,
  input: { stripeAccountId: string; returnUrl: string; refreshUrl: string },
): Promise<string> {
  const link = await stripe.v2.core.accountLinks.create({
    account: input.stripeAccountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['merchant'],
        collection_options: { fields: 'eventually_due', future_requirements: 'include' },
        return_url: input.returnUrl,
        refresh_url: input.refreshUrl,
      },
    },
  })
  const parsed = new URL(link.url)
  if (parsed.protocol !== 'https:' || parsed.origin !== 'https://connect.stripe.com') {
    throw new Error('Stripe returned an untrusted onboarding URL')
  }
  return parsed.toString()
}

export async function listStripeConnectCountries(stripe: Stripe): Promise<string[]> {
  const countries: string[] = []
  let startingAfter: string | undefined
  do {
    const page = await stripe.countrySpecs.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    for (const country of page.data) {
      countries.push(country.id.toUpperCase())
    }
    if (page.has_more) {
      const lastCountry = page.data.at(-1)
      if (!lastCountry) throw new Error('Stripe Country Specs pagination returned an empty page')
      startingAfter = lastCountry.id
    } else {
      startingAfter = undefined
    }
  } while (startingAfter)
  return countries.sort()
}
