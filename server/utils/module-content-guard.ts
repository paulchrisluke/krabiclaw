/**
 * A service page is the services page or a page beneath it.
 *
 * Its path is the whole definition. A page carries no `status` — the column is
 * required of articles, social posts and Q&A, and every page root on every site
 * has it NULL — so a `status = 'published'` predicate here matched nothing and
 * reported every site as having no services. The onboarding checklist asked the
 * same question through a `metadata_json.recipe` marker that no page carries,
 * and got the same nothing. One question, one predicate.
 */
export const SERVICE_PAGE_SQL = `kind = 'page' AND row_role = 'root' AND (path = '/services' OR path LIKE '/services/%')`
