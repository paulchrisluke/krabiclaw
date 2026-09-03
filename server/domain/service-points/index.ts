import { HTTPError } from 'nitro'

import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'

const SERVICE_POINT_LABEL_MAX_LENGTH = 120
const ORDERING_QR_TOKEN_PREFIX = 'oqr_'
const ORDERING_QR_RANDOM_BYTES = 32

export type ServicePointStatus = 'active' | 'paused'

export interface ServicePointScope {
  organizationId: string
  siteId: string
  locationId: string
}

export interface ServicePointRecord {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  label: string
  status: ServicePointStatus
  created_at: string
  updated_at: string
  qr_credential: {
    id: string
    version: number
    created_at: string
  } | null
}

interface ServicePointRow extends Omit<ServicePointRecord, 'qr_credential'> {
  qr_id: string | null
  qr_version: number | null
  qr_created_at: string | null
}

interface OrderingQrResolutionRow {
  organization_id: string
  site_id: string
  site_name: string
  site_subdomain: string | null
  site_public_url: string | null
  site_custom_domain: string | null
  location_id: string
  location_slug: string
  location_title: string
  service_point_id: string
  service_point_label: string
  credential_id: string
  credential_version: number
}

export interface OrderingQrResolution {
  organizationId: string
  siteId: string
  siteName: string
  siteSubdomain: string | null
  sitePublicUrl: string | null
  siteCustomDomain: string | null
  locationId: string
  locationSlug: string
  locationTitle: string
  servicePointId: string
  servicePointLabel: string
  credentialId: string
  credentialVersion: number
}

function servicePointSelect(): string {
  return `
    SELECT sp.id, sp.organization_id, sp.site_id, sp.location_id, sp.label, sp.status,
           sp.created_at, sp.updated_at,
           qr.id AS qr_id, qr.version AS qr_version, qr.created_at AS qr_created_at
      FROM service_points sp
      LEFT JOIN ordering_qr_credentials qr
        ON qr.service_point_id = sp.id
       AND qr.organization_id = sp.organization_id
       AND qr.site_id = sp.site_id
       AND qr.location_id = sp.location_id
       AND qr.status = 'active'
  `
}

function hydrateServicePoint(row: ServicePointRow): ServicePointRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    site_id: row.site_id,
    location_id: row.location_id,
    label: row.label,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    qr_credential: row.qr_id && row.qr_version !== null && row.qr_created_at
      ? { id: row.qr_id, version: Number(row.qr_version), created_at: row.qr_created_at }
      : null,
  }
}

function normalizeLabel(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Service point label is required' })
  }
  const label = value.trim()
  if (!label || label.length > SERVICE_POINT_LABEL_MAX_LENGTH) {
    throw new HTTPError({ statusCode: 400, statusMessage: `Service point label must be 1-${SERVICE_POINT_LABEL_MAX_LENGTH} characters` })
  }
  return label
}

function normalizeStatus(value: unknown): ServicePointStatus {
  if (value !== 'active' && value !== 'paused') {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Service point status must be active or paused' })
  }
  return value
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function generateOrderingQrCredential(): string {
  return `${ORDERING_QR_TOKEN_PREFIX}${randomBase64Url(ORDERING_QR_RANDOM_BYTES)}`
}

export function isOrderingQrCredential(value: unknown): value is string {
  return typeof value === 'string'
    && value.length === ORDERING_QR_TOKEN_PREFIX.length + 43
    && value.startsWith(ORDERING_QR_TOKEN_PREFIX)
    && /^[A-Za-z0-9_-]+$/.test(value.slice(ORDERING_QR_TOKEN_PREFIX.length))
}

export async function hashOrderingQrCredential(credential: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function listServicePoints(db: DbClient, scope: ServicePointScope): Promise<ServicePointRecord[]> {
  const rows = await queryAll<ServicePointRow>(db, `${servicePointSelect()}
    WHERE sp.organization_id = ? AND sp.site_id = ? AND sp.location_id = ?
    ORDER BY lower(sp.label), sp.id
  `, [scope.organizationId, scope.siteId, scope.locationId])
  return rows.map(hydrateServicePoint)
}

async function loadServicePoint(db: DbClient, scope: ServicePointScope, servicePointId: string): Promise<ServicePointRecord | null> {
  const row = await queryFirst<ServicePointRow>(db, `${servicePointSelect()}
    WHERE sp.id = ? AND sp.organization_id = ? AND sp.site_id = ? AND sp.location_id = ?
    LIMIT 1
  `, [servicePointId, scope.organizationId, scope.siteId, scope.locationId])
  return row ? hydrateServicePoint(row) : null
}

async function requireServicePoint(db: DbClient, scope: ServicePointScope, servicePointId: string): Promise<ServicePointRecord> {
  const servicePoint = await loadServicePoint(db, scope, servicePointId)
  if (!servicePoint) throw new HTTPError({ statusCode: 404, statusMessage: 'Service point not found' })
  return servicePoint
}

export async function createServicePoint(
  db: DbClient,
  scope: ServicePointScope,
  input: { label: unknown },
  userId: string,
): Promise<ServicePointRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO service_points (
      id, organization_id, site_id, location_id, label, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `, [id, scope.organizationId, scope.siteId, scope.locationId, normalizeLabel(input.label), userId, now, now])
  return await requireServicePoint(db, scope, id)
}

export async function updateServicePoint(
  db: DbClient,
  scope: ServicePointScope,
  servicePointId: string,
  input: { label?: unknown; status?: unknown },
): Promise<ServicePointRecord> {
  const updates: string[] = []
  const params: unknown[] = []
  if (input.label !== undefined) {
    updates.push('label = ?')
    params.push(normalizeLabel(input.label))
  }
  if (input.status !== undefined) {
    updates.push('status = ?')
    params.push(normalizeStatus(input.status))
  }
  if (!updates.length) throw new HTTPError({ statusCode: 400, statusMessage: 'Provide label or status' })
  updates.push('updated_at = ?')
  params.push(new Date().toISOString(), servicePointId, scope.organizationId, scope.siteId, scope.locationId)
  const result = await execute(db, `
    UPDATE service_points SET ${updates.join(', ')}
     WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?
  `, params)
  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Service point not found' })
  }
  return await requireServicePoint(db, scope, servicePointId)
}

export async function issueServicePointCredential(
  db: DbClient,
  scope: ServicePointScope,
  servicePointId: string,
  userId: string,
  mode: 'provision' | 'rotate',
): Promise<{ credential: string; credentialId: string; version: number; servicePoint: ServicePointRecord }> {
  const servicePoint = await requireServicePoint(db, scope, servicePointId)
  const existing = servicePoint.qr_credential
  if (mode === 'provision' && existing) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Service point already has an active Ordering QR credential' })
  }
  if (mode === 'rotate' && !existing) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Service point has no active Ordering QR credential to rotate' })
  }

  const previous = await queryFirst<{ max_version: number | null }>(db, `
    SELECT MAX(version) AS max_version
      FROM ordering_qr_credentials
     WHERE service_point_id = ? AND organization_id = ? AND site_id = ? AND location_id = ?
  `, [servicePointId, scope.organizationId, scope.siteId, scope.locationId])
  const version = Number(previous?.max_version ?? 0) + 1
  const credential = generateOrderingQrCredential()
  const tokenHash = await hashOrderingQrCredential(credential)
  const credentialId = crypto.randomUUID()
  const now = new Date().toISOString()
  const statements = []
  if (existing) {
    statements.push({
      query: `UPDATE ordering_qr_credentials SET status = 'revoked', revoked_at = ?
               WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND service_point_id = ? AND status = 'active'`,
      params: [now, existing.id, scope.organizationId, scope.siteId, scope.locationId, servicePointId],
    })
  }
  statements.push({
    query: `INSERT INTO ordering_qr_credentials (
              id, organization_id, site_id, location_id, service_point_id, version,
              token_hash, status, created_by, created_at, revoked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)`,
    params: [credentialId, scope.organizationId, scope.siteId, scope.locationId, servicePointId, version, tokenHash, userId, now],
  })
  await executeBatch(db, statements, { operation: `${mode} Ordering QR credential` })
  return {
    credential,
    credentialId,
    version,
    servicePoint: await requireServicePoint(db, scope, servicePointId),
  }
}

export async function revokeServicePointCredential(
  db: DbClient,
  scope: ServicePointScope,
  servicePointId: string,
): Promise<boolean> {
  await requireServicePoint(db, scope, servicePointId)
  const now = new Date().toISOString()
  const result = await execute(db, `
    UPDATE ordering_qr_credentials SET status = 'revoked', revoked_at = ?
     WHERE service_point_id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND status = 'active'
  `, [now, servicePointId, scope.organizationId, scope.siteId, scope.locationId])
  return Number(result.meta.changes ?? 0) === 1
}

export async function resolveOrderingQrCredential(
  db: DbClient,
  credential: string,
  expectedScope: Partial<ServicePointScope> = {},
): Promise<OrderingQrResolution | null> {
  if (!isOrderingQrCredential(credential)) return null
  const tokenHash = await hashOrderingQrCredential(credential)
  const clauses = [
    'qr.token_hash = ?',
    "qr.status = 'active'",
    'qr.service_point_id IS NOT NULL',
    "sp.status = 'active'",
    "bl.status = 'active'",
    "s.status = 'active'",
    "s.onboarding_status = 'active'",
  ]
  const params: unknown[] = [tokenHash]
  if (expectedScope.organizationId) {
    clauses.push('qr.organization_id = ?')
    params.push(expectedScope.organizationId)
  }
  if (expectedScope.siteId) {
    clauses.push('qr.site_id = ?')
    params.push(expectedScope.siteId)
  }
  if (expectedScope.locationId) {
    clauses.push('qr.location_id = ?')
    params.push(expectedScope.locationId)
  }
  const row = await queryFirst<OrderingQrResolutionRow>(db, `
    SELECT qr.organization_id, qr.site_id, qr.location_id,
           qr.id AS credential_id, qr.version AS credential_version,
           sp.id AS service_point_id, sp.label AS service_point_label,
           bl.slug AS location_slug, bl.title AS location_title,
           COALESCE(s.brand_name, s.slug) AS site_name, s.subdomain AS site_subdomain,
           s.public_url AS site_public_url, s.custom_domain AS site_custom_domain
      FROM ordering_qr_credentials qr
      JOIN service_points sp
        ON sp.id = qr.service_point_id
       AND sp.organization_id = qr.organization_id
       AND sp.site_id = qr.site_id
       AND sp.location_id = qr.location_id
      JOIN business_locations bl
        ON bl.id = qr.location_id
       AND bl.organization_id = qr.organization_id
       AND bl.site_id = qr.site_id
      JOIN sites s
        ON s.id = qr.site_id
       AND s.organization_id = qr.organization_id
     WHERE ${clauses.join(' AND ')}
     LIMIT 1
  `, params)
  if (!row) return null
  return {
    organizationId: row.organization_id,
    siteId: row.site_id,
    siteName: row.site_name,
    siteSubdomain: row.site_subdomain,
    sitePublicUrl: row.site_public_url,
    siteCustomDomain: row.site_custom_domain,
    locationId: row.location_id,
    locationSlug: row.location_slug,
    locationTitle: row.location_title,
    servicePointId: row.service_point_id,
    servicePointLabel: row.service_point_label,
    credentialId: row.credential_id,
    credentialVersion: Number(row.credential_version),
  }
}
