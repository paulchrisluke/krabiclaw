import { PLATFORM_LOCALES, platformLocale } from '~/shared/platform-locales'
import { prepareContentDocumentDeletion } from '~/server/utils/content/documents'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import type { CloudflareEnv } from '~/server/utils/auth'
import { canonicalizeLocale, getPersistedSourceLocale } from '~/server/utils/localization'
import { localizationError } from '~/server/utils/localization-errors'

interface OrganizationLanguageRow {
  id: string
  locale: string
  status: 'published' | 'disabled'
  activated_at: string | null
  disabled_at: string | null
  is_source: number
}

async function loadLanguage(db: DbClient, organizationId: string, locale: string) {
  return await queryFirst<OrganizationLanguageRow>(db, `
    SELECT id, locale, status, activated_at, disabled_at, is_source FROM organization_locales
     WHERE organization_id = ?  AND locale = ?
  `, [organizationId, locale])
}

/** A new language remains private while its content is authored. */
export async function addOrganizationLanguage(
  db: DbClient, env: CloudflareEnv,
  input: { organizationId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === (await getPersistedSourceLocale(db, input.organizationId)).locale) return loadLanguage(db, input.organizationId, locale)
  const catalog = platformLocale(locale)
  if (!catalog) localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale is unavailable', { locale })
  const projection = await getOrganizationBillingStatus(env, db, input.organizationId)
  if (projection.entitlements.additional_languages !== true || !projection.stripeSubscriptionId) {
    localizationError(402, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'An active subscription with additional website languages is required to add a language')
  }
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO organization_locales (id, organization_id, locale, label, is_source, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 'disabled', ?, ?)
    ON CONFLICT(organization_id, locale) DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at
  `, [`locale::${input.organizationId}::${locale}`, input.organizationId, locale, catalog.label, now, now])
  return await loadLanguage(db, input.organizationId, locale)
}

/** Publishing exposes authored translations; absent representations stay absent. */
export async function publishOrganizationLanguage(
  db: DbClient, env: CloudflareEnv,
  input: { organizationId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === (await getPersistedSourceLocale(db, input.organizationId)).locale) return loadLanguage(db, input.organizationId, locale)
  const catalog = platformLocale(locale)
  if (!catalog) localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale is unavailable', { locale })
  const projection = await getOrganizationBillingStatus(env, db, input.organizationId)
  if (projection.entitlements.additional_languages !== true || !projection.stripeSubscriptionId) {
    localizationError(402, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'An active subscription with additional website languages is required to publish a language')
  }
  const existing = await loadLanguage(db, input.organizationId, locale)
  if (!existing) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Add the language before publishing it', { locale })

  const now = new Date().toISOString()
  await execute(db, `
    UPDATE organization_locales SET status = 'published',
      activated_at = COALESCE(activated_at, ?), disabled_at = NULL, updated_at = ?
     WHERE organization_id = ?  AND locale = ? AND is_source = 0
  `, [now, now, input.organizationId, locale])
  return await loadLanguage(db, input.organizationId, locale)
}

export async function disableOrganizationLanguage(
  db: DbClient,
  input: { organizationId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === (await getPersistedSourceLocale(db, input.organizationId)).locale) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'The source language cannot be disabled')
  const language = await loadLanguage(db, input.organizationId, locale)
  if (!language) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Language not found', { locale })
  const now = new Date().toISOString()
  await execute(db, `UPDATE organization_locales SET status = 'disabled', disabled_at = COALESCE(disabled_at, ?), updated_at = ?
    WHERE organization_id = ?  AND locale = ? AND is_source = 0`, [now, now, input.organizationId, locale])
  return await loadLanguage(db, input.organizationId, locale)
}

export async function deleteDisabledOrganizationLanguageContent(
  db: DbClient,
  input: { organizationId: string; locale: unknown },
): Promise<{ deleted: true; locale: string }> {
  const locale = canonicalizeLocale(input.locale)
  if (locale === (await getPersistedSourceLocale(db, input.organizationId)).locale) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Source content cannot be deleted')
  const language = await loadLanguage(db, input.organizationId, locale)
  if (language && language.status !== 'disabled') localizationError(409, 'LOCALIZATION_VALIDATION_FAILED', 'Disable the language before permanently deleting its content', { locale })
  const documents = await queryAll<{ id: string }>(db, `SELECT id FROM content_documents
    WHERE organization_id = ?  AND locale = ? AND row_role = 'representation'`, [input.organizationId, locale])
  const statements = [
    { query: `UPDATE organization_locales SET locale = NULL WHERE organization_id = ? AND locale = ? AND status <> 'disabled'`, params: [input.organizationId, locale] },
    { query: `DELETE FROM organization_redirects WHERE organization_id = ? AND locale = ?`, params: [input.organizationId, locale] },
    ...documents.flatMap(document => prepareContentDocumentDeletion({ documentId: document.id, organizationId: input.organizationId})),
    { query: `DELETE FROM resource_localizations WHERE organization_id = ? AND locale = ?`, params: [input.organizationId, locale] },
    { query: `DELETE FROM organization_locales WHERE organization_id = ? AND locale = ? AND is_source = 0 AND status = 'disabled'`, params: [input.organizationId, locale] },
  ]
  await executeBatch(db, statements, { operation: 'delete disabled language content' })
  return { deleted: true, locale }
}


export async function getOrganizationLanguageSettings(
  db: DbClient, env: CloudflareEnv,
  input: { organizationId: string },
) {
  // The plan and the site's languages are independent reads; running them in
  // series made the slowest endpoint in production wait for both in turn.
  const [projection, languages, source] = await Promise.all([
    getOrganizationBillingStatus(env, db, input.organizationId),
    queryAll(db, `
      SELECT locale, label, is_source, status FROM organization_locales
       WHERE organization_id = ? 
    `, [input.organizationId]),
    getPersistedSourceLocale(db, input.organizationId),
  ])
  const availableCatalogs = PLATFORM_LOCALES.filter(catalog => catalog.locale !== source.locale)
    .map(({ locale, label, direction }) => ({ locale, label, direction }))
  return { effective_plan: projection.plan, languages, available_catalogs: availableCatalogs }
}
