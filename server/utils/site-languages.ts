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
     WHERE organization_id = ?  AND locale = ?
  `, [organizationId, locale])
}

/**
 * Adding a language starts it disabled, which is the authoring state.
 *
 * It used to be created `published`, so the moment an owner picked Japanese the
 * site served `/ja` with nothing in it — footer, sitemap, hreflang and routes
 * all live against zero content, and a locale shows exactly what has been
 * translated into it, so those routes 404. Translating first was impossible
 * because writes required `published`. Add, translate, then publish.
 */
export async function addSiteLanguage(
  db: DbClient, env: CloudflareEnv,
  input: { organizationId: string; siteId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English is the immutable source language')
  const catalog = platformLocale(locale)
  if (!catalog) localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale is unavailable', { locale })
  const projection = await getOrganizationBillingStatus(env, db, input.organizationId)
  if (projection.plan !== 'growth' || !projection.stripeSubscriptionId) {
    localizationError(402, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'An active Growth subscription is required to add a language')
  }
  const now = new Date().toISOString()
  // No public-slot count here: adding costs the site nothing until it is
  // published, and the limit belongs where the slot is actually taken.
  await execute(db, `
    INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 'disabled', ?, ?)
    ON CONFLICT(organization_id, site_id, locale) DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at
  `, [`locale::${input.organizationId}::${input.siteId}::${locale}`, input.organizationId, input.siteId, locale, catalog.label, now, now])
  return await loadLanguage(db, input.organizationId, input.siteId, locale)
}

/**
 * Publishing is what makes a language public. Untranslated fields fall back to
 * the English source, so how much is translated is the owner's call to read off
 * the progress report, not a condition of going public.
 */
export async function publishSiteLanguage(
  db: DbClient, env: CloudflareEnv,
  input: { organizationId: string; siteId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English is the immutable source language')
  const catalog = platformLocale(locale)
  if (!catalog) localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale is unavailable', { locale })
  const projection = await getOrganizationBillingStatus(env, db, input.organizationId)
  if (projection.plan !== 'growth' || !projection.stripeSubscriptionId) {
    localizationError(402, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'An active Growth subscription is required to publish a language')
  }
  const existing = await loadLanguage(db, input.organizationId, input.siteId, locale)
  if (!existing) localizationError(404, 'LOCALIZATION_NOT_FOUND', 'Add the language before publishing it', { locale })

  const now = new Date().toISOString()
  const result = await execute(db, `
    UPDATE site_locales SET status = 'published',
      activated_at = COALESCE(activated_at, ?), disabled_at = NULL, updated_at = ?
     WHERE organization_id = ?  AND locale = ? AND is_source = 0
       AND (SELECT COUNT(*) FROM site_locales other
              WHERE other.organization_id = ? AND other.site_id = ? AND other.is_source = 0
                AND other.status = 'published' AND other.locale <> ?) < 2
  `, [now, now, input.organizationId, locale, input.organizationId, input.siteId, locale])
  if (result.meta?.changes !== 1) localizationError(409, 'LANGUAGE_ENTITLEMENT_REQUIRED', 'Language could not be published because two secondary languages are already published.')
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
    WHERE organization_id = ?  AND locale = ? AND is_source = 0`, [now, now, input.organizationId, locale])
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
    WHERE organization_id = ?  AND locale = ? AND row_role = 'representation'`, [input.organizationId, locale])
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
  // The plan and the site's languages are independent reads; running them in
  // series made the slowest endpoint in production wait for both in turn.
  const [projection, languages] = await Promise.all([
    getOrganizationBillingStatus(env, db, input.organizationId),
    queryAll(db, `
      SELECT locale, label, is_source, status FROM site_locales
       WHERE organization_id = ? 
    `, [input.organizationId]),
  ])
  const availableCatalogs = PLATFORM_LOCALES.filter(catalog => catalog.locale !== 'en')
    .map(({ locale, label, direction }) => ({ locale, label, direction }))
  return { effective_plan: projection.plan, languages, available_catalogs: availableCatalogs }
}
