// Tables with (organization_id, site_id) that need re-parenting when a site transfers orgs.
// Excludes billing/credits tables (organization_billing, organization_entitlements, ai_credits,
// ai_usage_log, stripe_webhook_events) — those stay with the originating org.
const SITE_SCOPED_TABLES = [
  'site_domains',
  'site_domain_events',
  'google_business_connections',
  'business_locations',
  'google_business_events',
  'facebook_pages_connections',
  'site_content',
  'site_content_drafts',
  'site_config',
  'site_locales',
  'site_content_translations',
  'menu_translations',
  'menu_item_translations',
  'business_location_translations',
  'post_translations',
  'translation_jobs',
  'translation_job_items',
  'media_assets',
  'menus',
  'reviews',
  'posts',
  'contact_submissions',
  'reservation_submissions',
  'notifications',
  'chowbot_conversations',
  'chowbot_messages',
  'location_qa',
  'experiences',
  'experience_bookings',
] as const

export async function executeSiteTransfer(
  db: D1Database,
  siteId: string,
  fromOrgId: string,
  toOrgId: string,
  transferId: string,
  acceptedByUserId: string,
): Promise<void> {
  const now = new Date().toISOString()

  const batch: D1PreparedStatement[] = SITE_SCOPED_TABLES.map((table) =>
    db
      .prepare(`UPDATE ${table} SET organization_id = ? WHERE site_id = ? AND organization_id = ?`)
      .bind(toOrgId, siteId, fromOrgId),
  )

  // post_channel_jobs has organization_id but no site_id — update via post join
  batch.push(
    db
      .prepare(
        `UPDATE post_channel_jobs SET organization_id = ?
         WHERE organization_id = ? AND post_id IN (SELECT id FROM posts WHERE site_id = ?)`,
      )
      .bind(toOrgId, fromOrgId, siteId),
  )

  // sites itself — update last so the FK is still valid during the batch
  batch.push(
    db
      .prepare(
        `UPDATE sites SET organization_id = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
      )
      .bind(toOrgId, now, siteId, fromOrgId),
  )

  // mark the transfer request complete
  batch.push(
    db
      .prepare(
        `UPDATE site_transfer_requests
         SET status = 'accepted', accepted_by_user_id = ?, completed_at = ?
         WHERE id = ?`,
      )
      .bind(acceptedByUserId, now, transferId),
  )

  await db.batch(batch)
}
