# Rebaseline handoff — schema half of issue #1053

You own **`server/db/schema.ts`**, **`migrations/`** (baseline, `meta/_journal.json`, snapshots) and
the **`SiteIntegrations` / `SiteSettings` types in `shared/site-settings.ts`**, and nothing else.
A parallel session owns every other file in the repo for #1053 and will rebase onto your result.
Do not change application code, pages, server utils, MCP tools or tests — you will collide.

Context: these changes cannot be expressed as in-place D1 migrations. Verified empirically against
the current chain — `ALTER TABLE sites DROP COLUMN last_published_at` fails
(`sites_instants_check` names it) and `content_documents.visibility` cannot accept a new value
(two table-level CHECKs pin `'public'|'unlisted'`). Rebuilding either table cascade-deletes
children on D1 — `sites` has 23, `content_documents` has `content_blocks` and `broadcasts` — and
`yarn lint:migrations` blocks it. `schema.ts` already states this at the retained
`sites_config_notifications_check` comment.

## 1. `sites`

- **Drop `last_published_at`.** Remove the column and remove its term from `sites_instants_check`,
  which becomes `(created_at IS NULL OR …) AND (updated_at IS NULL OR …) AND (analytics_data_start_at IS NULL OR …)`.
  Nothing replaces it; `updated_at` stays the row modification timestamp.
- **Drop `robots`.**
- **Drop `sites_config_google_site_verification_check`** and remove the stored
  `settings_json.$.config.google_site_verification` key from every row.
- **Drop the retained inert `sites_config_notifications_check`** while the rebuild is free —
  its own comment says removing it belongs to a rebaseline.
- **Replace the `integrations_json` shape and its CHECKs.** Delete
  `sites_facebook_integration_check`, `sites_google_integration_check`,
  `sites_google_credentials_check` and `sites_facebook_credentials_check`. Keep
  `sites_integrations_json_check`. Add one CHECK per new key, each `IS NULL OR (… ) IS TRUE`,
  matching the types below:

  - `sites_google_credential_check` — object, `revision` text, `status` in
    (`active`,`disabled`,`error`), `encrypted_access_token` and `encrypted_refresh_token` text,
    `scopes` text, `provider_account_email` text.
  - `sites_google_analytics_check` — object, `revision` text, `status` in
    (`active`,`disabled`,`error`), `measurement_id` text.
  - `sites_google_search_console_check` — object, `revision` text, `status` in
    (`active`,`disabled`,`error`), `site_url` text.
  - `sites_facebook_check` — object, `revision` text, `status` in
    (`active`,`disabled`,`error`), `encrypted_user_token` text, `page_id` text, `page_name` text.
  - `sites_instagram_check` — object, `revision` text, `status` in
    (`active`,`disabled`,`error`), `encrypted_access_token` text, `instagram_user_id` text.

  There is no `kind` discriminator on any of them. The `manual` Google shape is deleted.

## 2. `business_locations`

- **Drop `robots`.**
- Keep `google_place_id` exactly as it is — it stays the canonical Google Maps mapping.

## 3. `content_documents`

- **Drop `robots`.**
- **`visibility` becomes `listed | unlisted`.** Change
  `content_documents_article_visibility_check` to
  `kind NOT IN ('article','social_post') OR row_role <> 'root' OR (visibility IN ('listed','unlisted')) IS 1`.
  `content_documents_role_check` keeps its `visibility IS NULL` term for representation rows,
  unchanged.

## 4. Data transfer (`scripts/rebaseline-data.mjs`)

Add transforms, and assert each one afterwards the way the existing transforms do:

- `UPDATE content_documents SET visibility = 'listed' WHERE visibility = 'public'` —
  audit that no row is left with `visibility` outside (`listed`,`unlisted`,NULL).
- `settings_json = json_remove(settings_json, '$.config.google_site_verification')` on every site.
- `integrations_json` rewrite per site, from the old `$.facebook` / `$.google`:
  - old `$.facebook` → `$.facebook`, renaming `facebook_page_id`→`page_id`,
    `facebook_page_name`→`page_name`, dropping `kind`. **Create no `$.instagram`** — existing
    tenants reconnect Instagram explicitly.
  - old `$.google` with `kind='oauth'` → split into `$.google_credential`
    (`provider_account_email`, `encrypted_access_token`, `encrypted_refresh_token`, `scopes`,
    `expires_at`, `connected_by_user_id`, `status`, timestamps, fresh `revision`),
    `$.google_analytics` (`ga4_property_id`→`property_id`, `ga4_property_name`→`property_name`,
    `ga4_measurement_id`→`measurement_id`; omit the key entirely when no measurement id and no
    property id), and `$.google_search_console` (`search_console_site_url`→`site_url`,
    `verified: true`; omit the key when the url is absent).
  - old `$.google` with `kind='manual'` and `status='active'` → `$.google_analytics` carrying only
    `measurement_id` (no credential, no property). This is what keeps existing tenants' Zaraz
    tracking alive; a `manual`/`disabled` row becomes no key at all.
  - drop `$.google` and any `kind` field everywhere.
- Audit that no row's `integrations_json` still contains `$.google` or `$.facebook.kind`, and that
  every surviving key satisfies its new CHECK.

## 5. `shared/site-settings.ts`

Replace the integration types with exactly this, and delete `google_site_verification` from
`SiteSettings['config']`. `IntegrationVersion` and `IntegrationOAuthState` stay as they are.

```ts
export interface GoogleCredential {
  revision: string
  id: string
  connected_by_user_id?: string
  provider_account_email: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  /** Union of the scopes granted across every connected Google product. */
  scopes: string
  status: 'active' | 'disabled' | 'error'
  expires_at?: string
  created_at: string
  updated_at: string
}

export interface GoogleAnalyticsIntegration {
  revision: string
  /** Absent on a site whose measurement id predates the OAuth property picker. */
  property_id?: string
  property_name?: string
  measurement_id: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface GoogleSearchConsoleIntegration {
  revision: string
  site_url: string
  verified: boolean
  /** Retained only while Google still requires the meta tag to be served. */
  verification_token?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface FacebookIntegration {
  revision: string
  id: string
  connected_by_user_id: string
  facebook_user_id: string
  page_id: string
  page_name: string
  encrypted_user_token: string
  encrypted_page_token?: string
  user_token_expires_at?: string
  scopes?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface InstagramIntegration {
  revision: string
  id: string
  connected_by_user_id: string
  instagram_user_id: string
  username: string
  encrypted_access_token: string
  token_expires_at?: string
  scopes?: string
  status: 'active' | 'disabled' | 'error'
  created_at: string
  updated_at: string
}

export interface SiteIntegrations {
  google_credential?: GoogleCredential
  google_analytics?: GoogleAnalyticsIntegration
  google_search_console?: GoogleSearchConsoleIntegration
  facebook?: FacebookIntegration
  instagram?: InstagramIntegration
}
```

## 6. What "done" means here

`yarn lint:migrations`, `yarn lint:schema-drift`, `yarn test:migrations` and
`yarn test:d1` pass, and the rebaseline audit reports every transform above.
Application code will not typecheck until the other session's branch lands on top —
that is expected, and is not yours to fix.
