import { PLATFORM_LOCALES, platformLocale } from '~/shared/platform-locales'
import { prepareContentDocumentDeletion } from '~/server/utils/content/documents'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { getOrganizationBillingStatus } from '~/server/utils/billing'
import type { CloudflareEnv } from '~/server/utils/auth'
import { canonicalizeLocale } from '~/server/utils/localization'
import { localizationError } from '~/server/utils/localization-errors'

interface SiteLanguageRow {
  id: string
  locale: string
  status: 'published' | 'disabled'
  activated_at: string | null
  disabled_at: string | null
}

async function loadLanguage(db: DbClient, organizationId: string, siteId: string, locale: string) {
  return await queryFirst<SiteLanguageRow>(db, `
    SELECT id, locale, status, activated_at, disabled_at FROM site_locales
     WHERE organization_id = ? AND site_id = ? AND locale = ?
  `, [organizationId, siteId, locale])
}

export async function enableSiteLanguage(
  db: DbClient, env: CloudflareEnv,
  input: { organizationId: string; siteId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English is the immutable source language')
  const catalog = platformLocale(locale)
  if (!catalog) localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale is unavailable', { locale })
  const projection = await getOrganizationBillingStatus(env, db, input.organizationId)
  if (projection.plan !== 'growth' || !projection.stripeSubscriptionId) {
    localizationError(402, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'An active Growth subscription is required to enable a language')
  }
  const now = new Date().toISOString()
  const result = await execute(db, `
    INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status, activated_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, 0, 'published', ?, ?, ?
     WHERE (SELECT COUNT(*) FROM site_locales
              WHERE organization_id = ? AND site_id = ? AND is_source = 0 AND status = 'published' AND locale <> ?) < 2
    ON CONFLICT(organization_id, site_id, locale) DO UPDATE SET label = excluded.label, status = 'published',
      activated_at = COALESCE(site_locales.activated_at, excluded.activated_at), disabled_at = NULL, updated_at = excluded.updated_at
  `, [`locale::${input.organizationId}::${input.siteId}::${locale}`, input.organizationId, input.siteId, locale, catalog.label, now, now, now, input.organizationId, input.siteId, locale])
  if (result.meta?.changes !== 1) localizationError(409, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'Language could not be enabled because two secondary languages are already published.')
  return await loadLanguage(db, input.organizationId, input.siteId, locale)
}

export async function disableSiteLanguage(
  db: DbClient,
  input: { organizationId: string; siteId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English cannot be disabled')
  const now = new Date().toISOString()
  await execute(db, `UPDATE site_locales SET status = 'disabled', disabled_at = COALESCE(disabled_at, ?), updated_at = ?
    WHERE organization_id = ? AND site_id = ? AND locale = ? AND is_source = 0`, [now, now, input.organizationId, input.siteId, locale])
  return await loadLanguage(db, input.organizationId, input.siteId, locale)
}

export async function deleteDisabledSiteLanguageContent(
  db: DbClient,
  input: { organizationId: string; siteId: string; locale: unknown },
): Promise<{ deleted: true; locale: string }> {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content cannot be deleted')
  const language = await loadLanguage(db, input.organizationId, input.siteId, locale)
  if (language && language.status !== 'disabled') localizationError(409, 'LOCALIZATION_VALIDATION_FAILED', 'Disable the language before permanently deleting its content', { locale })
  const documents = await queryAll<{ id: string }>(db, `SELECT id FROM content_documents
    WHERE organization_id = ? AND site_id = ? AND locale = ? AND row_role = 'representation'`, [input.organizationId, input.siteId, locale])
  const statements = [
    { query: `UPDATE site_locales SET locale = NULL WHERE organization_id = ? AND site_id = ? AND locale = ? AND status <> 'disabled'`, params: [input.organizationId, input.siteId, locale] },
    { query: `DELETE FROM site_redirects WHERE organization_id = ? AND site_id = ? AND locale = ?`, params: [input.organizationId, input.siteId, locale] },
    ...documents.flatMap(document => prepareContentDocumentDeletion({ documentId: document.id, organizationId: input.organizationId, siteId: input.siteId })),
    { query: `DELETE FROM resource_localizations WHERE organization_id = ? AND site_id = ? AND locale = ?`, params: [input.organizationId, input.siteId, locale] },
    { query: `DELETE FROM site_locales WHERE organization_id = ? AND site_id = ? AND locale = ? AND is_source = 0 AND status = 'disabled'`, params: [input.organizationId, input.siteId, locale] },
  ]
  await executeBatch(db, statements, { operation: 'delete disabled language content' })
  return { deleted: true, locale }
}


export async function getSiteLanguageSettings(
  db: DbClient, env: CloudflareEnv,
  input: { organizationId: string; siteId: string },
) {
  const projection = await getOrganizationBillingStatus(env, db, input.organizationId)
  const languages = await queryAll(db, `
    SELECT locale, label, is_source, status FROM site_locales
     WHERE organization_id = ? AND site_id = ?
  `, [input.organizationId, input.siteId])
  const availableCatalogs = PLATFORM_LOCALES.filter(catalog => catalog.locale !== 'en')
    .map(({ locale, label, direction }) => ({ locale, label, direction }))
  return { effective_plan: projection.plan, languages, available_catalogs: availableCatalogs }
}
