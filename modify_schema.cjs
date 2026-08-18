const fs = require('fs');

let schema = fs.readFileSync('server/db/schema.ts', 'utf8');

// 1. Drop translation tables
schema = schema.replace(/export const business_location_translations = sqliteTable\("business_location_translations", \{[\s\S]*?\n\}\);\n/g, '');
schema = schema.replace(/export const menu_item_translations = sqliteTable\("menu_item_translations", \{[\s\S]*?\n\}\);\n/g, '');
schema = schema.replace(/export const menu_translations = sqliteTable\("menu_translations", \{[\s\S]*?\n\}\);\n/g, '');
schema = schema.replace(/export const post_translations = sqliteTable\("post_translations", \{[\s\S]*?\n\}\);\n/g, '');

// 2. Drop content_revisions table
schema = schema.replace(/export const content_revisions = sqliteTable\("content_revisions", \{[\s\S]*?\n\}\);\n/g, '');

// 3. Drop status from site_locales
schema = schema.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/g, '');
schema = schema.replace(/\tcheck\("site_locales_status_check", sql`status IN \('draft', 'published', 'disabled'\)`\),\n/g, '');
schema = schema.replace(/\tindex\("site_locales_site_status_idx"\)\.on\(table\.site_id, table\.status\),\n/g, '');

// 4. Drop status from menus
schema = schema.replace(/export const menus = sqliteTable\("menus", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    return match.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/, '');
});

// 5. Drop status from offerings
schema = schema.replace(/export const offerings = sqliteTable\("offerings", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    let res = match.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/, '');
    res = res.replace(/\tindex\("offerings_site_status_sort_idx"\)\.on\(table\.site_id, table\.status, table\.sort_order\),\n/, '\tindex("offerings_site_sort_idx").on(table.site_id, table.sort_order),\n');
    res = res.replace(/\tcheck\("offerings_status_check", sql`status IN \('draft', 'published', 'archived'\)`\),\n/, '');
    return res;
});

// 6. Drop status from platform_docs
schema = schema.replace(/export const platform_docs = sqliteTable\("platform_docs", \{[\s\S]*?\n\}\);/g, (match) => {
    return match.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/, '');
});

// 7. Drop status from posts
schema = schema.replace(/export const posts = sqliteTable\("posts", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    let res = match.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/, '');
    res = res.replace(/\tcheck\("posts_status_check", sql`status IN \('draft', 'published', 'archived'\)`\),\n/, '');
    return res;
});

// 8. Drop status from site_link_pages
schema = schema.replace(/export const site_link_pages = sqliteTable\("site_link_pages", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    let res = match.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/, '');
    res = res.replace(/\tindex\("site_link_pages_site_status_idx"\)\.on\(table\.site_id, table\.status\),\n/, '');
    res = res.replace(/\tcheck\("site_link_pages_status_check", sql`status IN \('draft', 'published', 'archived'\)`\),\n/, '');
    return res;
});

// 9. Drop status and scheduled_revision_id from blog_posts
schema = schema.replace(/export const blog_posts = sqliteTable\("blog_posts", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    let res = match.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),.*?\n/, '');
    res = res.replace(/\tscheduled_revision_id: text\(\),\n/, '');
    res = res.replace(/\tcheck\("blog_posts_status_check", sql`status IN \('draft', 'published', 'scheduled', 'archived'\)`\),\n/, '');
    return res;
});

// 10. Drop path and status from tenant_pages
schema = schema.replace(/export const tenant_pages = sqliteTable\("tenant_pages", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    let res = match.replace(/\tpath: text\(\)\.notNull\(\),\n/, '');
    res = res.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/, '');
    res = res.replace(/\tunique\("tenant_pages_organization_id_site_id_path_unique"\)\.on\(table\.organization_id, table\.site_id, table\.path\),\n/, '');
    res = res.replace(/\tindex\("tenant_pages_site_status_sort_idx"\)\.on\(table\.site_id, table\.status, table\.sort_order\),\n/, '\tindex("tenant_pages_site_sort_idx").on(table.site_id, table.sort_order),\n');
    res = res.replace(/\tcheck\("tenant_pages_path_check", sql`path LIKE '\/%'`\),\n/, '');
    res = res.replace(/\tcheck\("tenant_pages_status_check", sql`status IN \('draft', 'published', 'archived'\)`\),\n/, '');
    return res;
});

// 11. Rename onboarding_drafts to onboarding_sessions
schema = schema.replace(/export const onboarding_drafts = sqliteTable\("onboarding_drafts", \{/g, 'export const onboarding_sessions = sqliteTable("onboarding_sessions", {');
schema = schema.replace(/uniqueIndex\("idx_onboarding_drafts_active_user_unique"\)/g, 'uniqueIndex("idx_onboarding_sessions_active_user_unique")');
schema = schema.replace(/check\("onboarding_drafts_status_check"/g, 'check("onboarding_sessions_status_check"');
schema = schema.replace(/index\("onboarding_drafts_user_id_idx"\)/g, 'index("onboarding_sessions_user_id_idx")');

// 12. Update content_documents
schema = schema.replace(/export const content_documents = sqliteTable\("content_documents", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    let res = match.replace(/\tdraft_revision_id: text\(\),\n/, '');
    res = res.replace(/\tpublished_revision_id: text\(\),\n/, '');
    return res;
});

// 13. Update tenant_page_variants
schema = schema.replace(/export const tenant_page_variants = sqliteTable\("tenant_page_variants", \{[\s\S]*?\n\}, \(table\) => \[\n([\s\S]*?)\n\]\);/g, (match) => {
    let res = match.replace(/\tdraft_document_id: text\(\)\.references\(\(\) => content_documents\.id, \{ onDelete: "set null" \} \),\n/, '\tdocument_id: text().references(() => content_documents.id, { onDelete: "set null" } ),\n');
    res = res.replace(/\tpublished_revision_id: text\(\)\.references\(\(\) => content_revisions\.id, \{ onDelete: "set null" \} \),\n/, '');
    res = res.replace(/\tpublished_path: text\(\)\.notNull\(\),\n/, '\tpath: text().notNull(),\n');
    res = res.replace(/\tdraft_path: text\(\)\.notNull\(\)\.default\("\/"\),\n/, '');
    res = res.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/, '');
    res = res.replace(/\tever_published: integer\(\)\.default\(0\)\.notNull\(\),\n/, '');
    res = res.replace(/\tunique\("tenant_page_variants_site_locale_path_unique"\)\.on\(table\.site_id, table\.locale, table\.published_path\),\n/, '\tunique("tenant_page_variants_site_locale_path_unique").on(table.site_id, table.locale, table.path),\n');
    res = res.replace(/\tindex\("tenant_page_variants_site_status_path_idx"\)\.on\(table\.site_id, table\.status, table\.published_path\),\n/, '\tindex("tenant_page_variants_site_path_idx").on(table.site_id, table.path),\n');
    res = res.replace(/\tcheck\("tenant_page_variants_path_check", sql`published_path LIKE '\/%' AND published_path NOT LIKE '\/\/%'`\),\n/, '\tcheck("tenant_page_variants_path_check", sql`path LIKE \\\'/%\\\' AND path NOT LIKE \\\'//%\\\'`), \n');
    res = res.replace(/\tcheck\("tenant_page_variants_status_check", sql`status IN \('draft', 'published', 'archived'\)`\),\n/, '');
    return res;
});

fs.writeFileSync('server/db/schema.ts', schema);
