import type { McpToolRole } from '~/server/utils/mcp-auth'

export interface McpToolDefinition {
  name: string
  description: string
  domain: string
  minimumRole: McpToolRole
  confirmRequired: boolean
  requiredEntitlement?: string
  inputSchema: Record<string, unknown>
}

const siteIdSchema = {
  site_id: { type: 'string', description: 'Site ID.' },
}

function siteTool(definition: Omit<McpToolDefinition, 'inputSchema'> & { inputSchema?: Record<string, unknown>; required?: string[] }): McpToolDefinition {
  const properties = {
    ...siteIdSchema,
    ...(definition.inputSchema ?? {}),
  }
  const required = ['site_id', ...(definition.required ?? [])]
  return {
    name: definition.name,
    description: definition.description,
    domain: definition.domain,
    minimumRole: definition.minimumRole,
    confirmRequired: definition.confirmRequired,
    requiredEntitlement: definition.requiredEntitlement,
    inputSchema: {
      type: 'object',
      properties,
      required,
      additionalProperties: true,
    },
  }
}

function globalTool(definition: McpToolDefinition): McpToolDefinition {
  return definition
}

export const MCP_TOOLS: McpToolDefinition[] = [
  globalTool({
    name: 'list_sites',
    description: 'List the caller’s accessible sites.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  }),
  globalTool({
    name: 'create_site',
    description: 'Create a new site in the caller’s organization.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        subdomain: { type: 'string' },
        vertical: { type: 'string', enum: ['restaurant', 'experience', 'retail', 'wellness', 'service'] },
      },
      required: ['name', 'subdomain', 'vertical'],
      additionalProperties: true,
    },
  }),
  siteTool({ name: 'get_site', description: 'Get site details.', domain: 'sites', minimumRole: 'editor', confirmRequired: false }),
  siteTool({ name: 'get_site_settings', description: 'Get editable site settings.', domain: 'sites', minimumRole: 'editor', confirmRequired: false }),
  siteTool({
    name: 'update_site_settings',
    description: 'Update editable site settings.',
    domain: 'sites',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      brand_name: { type: 'string' },
      brand_description: { type: 'string' },
      logo_url: { type: 'string' },
      logo_asset_id: { type: 'string' },
      contact_email: { type: 'string' },
      default_currency: { type: 'string' },
      brand_color: { type: 'string' },
      social_facebook: { type: 'string' },
      social_instagram: { type: 'string' },
      social_tiktok: { type: 'string' },
      footer_tagline: { type: 'string' },
      press_email: { type: 'string' },
      partnerships_email: { type: 'string' },
      catering_email: { type: 'string' },
      careers_email: { type: 'string' },
      google_analytics_measurement_id: { type: 'string' },
      google_site_verification: { type: 'string' },
      url_structure: { type: 'string' },
    },
  }),
  siteTool({ name: 'list_locations', description: 'List site locations.', domain: 'locations', minimumRole: 'editor', confirmRequired: false }),
  siteTool({ name: 'get_location', description: 'Get one location.', domain: 'locations', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' } }, required: ['location_id'] }),
  siteTool({ name: 'create_location', description: 'Create a location.', domain: 'locations', minimumRole: 'editor', confirmRequired: false, inputSchema: { title: { type: 'string' } }, required: ['title'] }),
  siteTool({ name: 'update_location', description: 'Update a location.', domain: 'locations', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' } }, required: ['location_id'] }),
  siteTool({ name: 'delete_location', description: 'Delete a location.', domain: 'locations', minimumRole: 'admin', confirmRequired: true, inputSchema: { location_id: { type: 'string' } }, required: ['location_id'] }),
  siteTool({ name: 'list_menus', description: 'List menus.', domain: 'menus', minimumRole: 'editor', confirmRequired: false }),
  siteTool({ name: 'get_menu', description: 'Get a menu with items.', domain: 'menus', minimumRole: 'editor', confirmRequired: false, inputSchema: { menu_id: { type: 'string' } }, required: ['menu_id'] }),
  siteTool({ name: 'create_menu', description: 'Create a menu.', domain: 'menus', minimumRole: 'editor', confirmRequired: false, inputSchema: { name: { type: 'string' }, location_id: { type: 'string' }, description: { type: 'string' } }, required: ['name'] }),
  siteTool({ name: 'update_menu', description: 'Update a menu.', domain: 'menus', minimumRole: 'editor', confirmRequired: false, inputSchema: { menu_id: { type: 'string' } }, required: ['menu_id'] }),
  siteTool({ name: 'delete_menu', description: 'Delete a menu.', domain: 'menus', minimumRole: 'admin', confirmRequired: true, inputSchema: { menu_id: { type: 'string' } }, required: ['menu_id'] }),
  siteTool({ name: 'create_menu_item', description: 'Create a menu item.', domain: 'menus', minimumRole: 'editor', confirmRequired: false, inputSchema: { menu_id: { type: 'string' }, name: { type: 'string' } }, required: ['menu_id', 'name'] }),
  siteTool({ name: 'update_menu_item', description: 'Update a menu item.', domain: 'menus', minimumRole: 'editor', confirmRequired: false, inputSchema: { menu_item_id: { type: 'string' } }, required: ['menu_item_id'] }),
  siteTool({ name: 'delete_menu_item', description: 'Delete a menu item.', domain: 'menus', minimumRole: 'admin', confirmRequired: true, inputSchema: { menu_item_id: { type: 'string' } }, required: ['menu_item_id'] }),
  siteTool({ name: 'rename_menu_section', description: 'Rename a menu section.', domain: 'menus', minimumRole: 'editor', confirmRequired: false, inputSchema: { menu_id: { type: 'string' }, old_name: { type: 'string' }, new_name: { type: 'string' } }, required: ['menu_id', 'old_name', 'new_name'] }),
  siteTool({ name: 'delete_menu_section', description: 'Delete a menu section.', domain: 'menus', minimumRole: 'admin', confirmRequired: true, inputSchema: { menu_id: { type: 'string' }, section_name: { type: 'string' } }, required: ['menu_id', 'section_name'] }),
  siteTool({ name: 'reorder_menu_items', description: 'Reorder menu items.', domain: 'menus', minimumRole: 'editor', confirmRequired: false, inputSchema: { menu_id: { type: 'string' }, updates: { type: 'array' } }, required: ['menu_id', 'updates'] }),
  siteTool({ name: 'list_posts', description: 'List posts.', domain: 'posts', minimumRole: 'editor', confirmRequired: false, inputSchema: { status: { type: 'string' } } }),
  siteTool({ name: 'get_post', description: 'Get a post.', domain: 'posts', minimumRole: 'editor', confirmRequired: false, inputSchema: { post_id: { type: 'string' } }, required: ['post_id'] }),
  siteTool({ name: 'create_post', description: 'Create a draft post.', domain: 'posts', minimumRole: 'editor', confirmRequired: false, inputSchema: { body: { type: 'string' } }, required: ['body'] }),
  siteTool({ name: 'update_post', description: 'Update a post.', domain: 'posts', minimumRole: 'editor', confirmRequired: false, inputSchema: { post_id: { type: 'string' } }, required: ['post_id'] }),
  siteTool({ name: 'publish_post', description: 'Publish a post.', domain: 'posts', minimumRole: 'editor', confirmRequired: true, inputSchema: { post_id: { type: 'string' }, channels: { type: 'array' } }, required: ['post_id'] }),
  siteTool({ name: 'delete_post', description: 'Delete a post.', domain: 'posts', minimumRole: 'admin', confirmRequired: true, inputSchema: { post_id: { type: 'string' } }, required: ['post_id'] }),
  siteTool({ name: 'list_media_assets', description: 'List media assets.', domain: 'media', minimumRole: 'editor', confirmRequired: false, inputSchema: { kind: { type: 'string' }, location_id: { type: 'string' } } }),
  siteTool({ name: 'request_media_upload', description: 'Create a pending image upload request.', domain: 'media', minimumRole: 'editor', confirmRequired: false, inputSchema: { filename: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' } } }),
  siteTool({ name: 'confirm_media_upload', description: 'Confirm a pending uploaded image.', domain: 'media', minimumRole: 'editor', confirmRequired: false, inputSchema: { asset_id: { type: 'string' } }, required: ['asset_id'] }),
  siteTool({ name: 'update_media_asset', description: 'Update media metadata.', domain: 'media', minimumRole: 'editor', confirmRequired: false, inputSchema: { asset_id: { type: 'string' }, alt_text: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' } }, required: ['asset_id'] }),
  siteTool({ name: 'delete_media_asset', description: 'Delete a media asset.', domain: 'media', minimumRole: 'editor', confirmRequired: true, inputSchema: { asset_id: { type: 'string' } }, required: ['asset_id'] }),
  siteTool({ name: 'import_menu_from_media', description: 'Extract a draft menu from a menu photo or PDF.', domain: 'media', minimumRole: 'editor', confirmRequired: false, inputSchema: { asset_id: { type: 'string' }, menu_name: { type: 'string' } }, required: ['asset_id'] }),
  siteTool({ name: 'get_page_content', description: 'Get merged published plus draft content for one page.', domain: 'content', minimumRole: 'editor', confirmRequired: false, inputSchema: { page: { type: 'string' }, location_id: { type: 'string' } }, required: ['page'] }),
  siteTool({ name: 'save_content_draft', description: 'Save draft content changes.', domain: 'content', minimumRole: 'editor', confirmRequired: false, inputSchema: { page: { type: 'string' }, changes: { type: 'object' }, location_id: { type: 'string' } }, required: ['page', 'changes'] }),
  siteTool({ name: 'get_content_draft_status', description: 'Get content draft status.', domain: 'content', minimumRole: 'editor', confirmRequired: false, inputSchema: { page: { type: 'string' }, location_id: { type: 'string' } } }),
  siteTool({ name: 'publish_content_drafts', description: 'Publish content drafts.', domain: 'content', minimumRole: 'admin', confirmRequired: true, inputSchema: { page: { type: 'string' }, location_id: { type: 'string' }, all: { type: 'boolean' } } }),
  siteTool({ name: 'discard_content_drafts', description: 'Discard content drafts.', domain: 'content', minimumRole: 'editor', confirmRequired: true, inputSchema: { page: { type: 'string' }, location_id: { type: 'string' }, all: { type: 'boolean' } } }),
  siteTool({ name: 'delete_content_field', description: 'Delete a content field from live and draft content.', domain: 'content', minimumRole: 'editor', confirmRequired: true, inputSchema: { page: { type: 'string' }, field: { type: 'string' }, location_id: { type: 'string' } }, required: ['page', 'field'] }),
  siteTool({ name: 'list_location_qa', description: 'List Q&A for a location.', domain: 'qa', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' } }, required: ['location_id'] }),
  siteTool({ name: 'create_location_qa', description: 'Create a Q&A pair for a location.', domain: 'qa', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, question: { type: 'string' } }, required: ['location_id', 'question'] }),
  siteTool({ name: 'update_location_qa', description: 'Update a Q&A entry.', domain: 'qa', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, qa_id: { type: 'string' } }, required: ['location_id', 'qa_id'] }),
  siteTool({ name: 'delete_location_qa', description: 'Delete a Q&A entry.', domain: 'qa', minimumRole: 'editor', confirmRequired: true, inputSchema: { location_id: { type: 'string' }, qa_id: { type: 'string' } }, required: ['location_id', 'qa_id'] }),
  siteTool({ name: 'reorder_location_qa', description: 'Swap two Q&A sort orders.', domain: 'qa', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, updates: { type: 'array' } }, required: ['location_id', 'updates'] }),
  siteTool({ name: 'list_location_reviews', description: 'List reviews for a location.', domain: 'reviews', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' } }, required: ['location_id'] }),
  siteTool({ name: 'reply_to_review', description: 'Add or update the owner reply for a review.', domain: 'reviews', minimumRole: 'admin', confirmRequired: false, inputSchema: { review_id: { type: 'string' }, reply: { type: 'string' } }, required: ['review_id', 'reply'] }),
  siteTool({ name: 'list_experiences', description: 'List experiences.', domain: 'experiences', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' } } }),
  siteTool({ name: 'get_experience', description: 'Get an experience.', domain: 'experiences', minimumRole: 'editor', confirmRequired: false, inputSchema: { experience_id: { type: 'string' } }, required: ['experience_id'] }),
  siteTool({ name: 'create_experience', description: 'Create an experience.', domain: 'experiences', minimumRole: 'editor', confirmRequired: false, inputSchema: { title: { type: 'string' } }, required: ['title'] }),
  siteTool({ name: 'update_experience', description: 'Update an experience.', domain: 'experiences', minimumRole: 'editor', confirmRequired: false, inputSchema: { experience_id: { type: 'string' } }, required: ['experience_id'] }),
  siteTool({ name: 'delete_experience', description: 'Delete an experience.', domain: 'experiences', minimumRole: 'editor', confirmRequired: true, inputSchema: { experience_id: { type: 'string' } }, required: ['experience_id'] }),
  siteTool({ name: 'list_experience_bookings', description: 'List experience bookings.', domain: 'experiences', minimumRole: 'editor', confirmRequired: false, inputSchema: { experience_id: { type: 'string' } }, required: ['experience_id'] }),
  siteTool({ name: 'update_experience_booking', description: 'Update a booking status.', domain: 'experiences', minimumRole: 'editor', confirmRequired: false, inputSchema: { experience_id: { type: 'string' }, booking_id: { type: 'string' }, status: { type: 'string' } }, required: ['experience_id', 'booking_id', 'status'] }),
  siteTool({ name: 'list_locales', description: 'List enabled locales.', domain: 'locales', minimumRole: 'editor', confirmRequired: false }),
  siteTool({ name: 'upsert_locale', description: 'Create or update a locale.', domain: 'locales', minimumRole: 'editor', confirmRequired: false, inputSchema: { locale: { type: 'string' } }, required: ['locale'] }),
  siteTool({ name: 'delete_locale', description: 'Delete a locale.', domain: 'locales', minimumRole: 'editor', confirmRequired: true, inputSchema: { locale: { type: 'string' } }, required: ['locale'] }),
  siteTool({ name: 'get_translation_inventory', description: 'Estimate translation scope and cost.', domain: 'translations', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'translation', inputSchema: { locale: { type: 'string' }, scope: { type: 'string' } }, required: ['locale'] }),
  siteTool({ name: 'start_translation_job', description: 'Create a translation job and run the first batch.', domain: 'translations', minimumRole: 'admin', confirmRequired: true, requiredEntitlement: 'translation', inputSchema: { locale: { type: 'string' }, scope: { type: 'string' }, includePublished: { type: 'boolean' } }, required: ['locale'] }),
  siteTool({ name: 'list_translation_jobs', description: 'List translation jobs.', domain: 'translations', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'translation' }),
  siteTool({ name: 'get_translation_job', description: 'Get a translation job and its items.', domain: 'translations', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'translation', inputSchema: { job_id: { type: 'string' } }, required: ['job_id'] }),
  siteTool({ name: 'run_translation_job_batch', description: 'Run another translation job batch.', domain: 'translations', minimumRole: 'admin', confirmRequired: true, requiredEntitlement: 'translation', inputSchema: { job_id: { type: 'string' } }, required: ['job_id'] }),
  siteTool({ name: 'get_translation_review_items', description: 'List translation review items.', domain: 'translations', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'translation', inputSchema: { locale: { type: 'string' }, scope: { type: 'string' }, status: { type: 'string' } }, required: ['locale'] }),
  siteTool({ name: 'save_translation_review_item', description: 'Save manual translation review edits.', domain: 'translations', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'translation', inputSchema: { locale: { type: 'string' }, entity_type: { type: 'string' }, entity_id: { type: 'string' }, field: { type: 'string' }, fields: { type: 'object' }, scope: { type: 'string' } }, required: ['locale', 'entity_type', 'entity_id', 'field', 'fields'] }),
  siteTool({ name: 'publish_translations', description: 'Publish draft translations.', domain: 'translations', minimumRole: 'admin', confirmRequired: true, requiredEntitlement: 'translation', inputSchema: { locale: { type: 'string' }, scope: { type: 'string' } }, required: ['locale'] }),
  siteTool({ name: 'list_contact_submissions', description: 'List contact submissions.', domain: 'submissions', minimumRole: 'editor', confirmRequired: false }),
  siteTool({ name: 'update_contact_submission', description: 'Update contact submission triage status.', domain: 'submissions', minimumRole: 'editor', confirmRequired: false, inputSchema: { submission_id: { type: 'string' }, status: { type: 'string' } }, required: ['submission_id', 'status'] }),
  siteTool({ name: 'list_reservation_submissions', description: 'List reservation submissions.', domain: 'submissions', minimumRole: 'editor', confirmRequired: false }),
  siteTool({ name: 'update_reservation_submission', description: 'Update reservation submission triage status.', domain: 'submissions', minimumRole: 'editor', confirmRequired: false, inputSchema: { submission_id: { type: 'string' }, status: { type: 'string' } }, required: ['submission_id', 'status'] }),
  siteTool({ name: 'get_notification_settings', description: 'Get notification settings.', domain: 'notifications', minimumRole: 'admin', confirmRequired: false }),
  siteTool({ name: 'update_notification_settings', description: 'Update notification settings.', domain: 'notifications', minimumRole: 'admin', confirmRequired: false, inputSchema: { whatsapp_phone: { type: 'string' } }, required: ['whatsapp_phone'] }),
  siteTool({ name: 'get_google_business_connection', description: 'Get a location Google Business connection.', domain: 'google_business', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'google_business', inputSchema: { location_id: { type: 'string' } }, required: ['location_id'] }),
  siteTool({ name: 'get_google_business_auth_url', description: 'Start Google Business auth for a location.', domain: 'google_business', minimumRole: 'owner', confirmRequired: false, requiredEntitlement: 'google_business', inputSchema: { location_id: { type: 'string' } }, required: ['location_id'] }),
  siteTool({ name: 'list_google_business_accounts', description: 'List connected Google Business accounts and locations.', domain: 'google_business', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'google_business' }),
  siteTool({ name: 'sync_google_business_locations', description: 'Sync selected Google Business locations into the site.', domain: 'google_business', minimumRole: 'owner', confirmRequired: true, requiredEntitlement: 'google_business', inputSchema: { account_id: { type: 'string' }, location_ids: { type: 'array' } }, required: ['account_id', 'location_ids'] }),
  siteTool({ name: 'list_work_requests', description: 'List managed-service work requests.', domain: 'managed_service', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'work_requests' }),
  siteTool({ name: 'create_work_request', description: 'Create a managed-service work request.', domain: 'managed_service', minimumRole: 'editor', confirmRequired: false, requiredEntitlement: 'work_requests', inputSchema: { type: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string' } }, required: ['type', 'title'] }),
].sort((a, b) => a.name.localeCompare(b.name))

export function getMcpTool(name: string) {
  return MCP_TOOLS.find((tool) => tool.name === name) ?? null
}
