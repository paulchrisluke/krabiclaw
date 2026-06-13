# MCP Phase 5 Coverage

This file is the closure checklist for the stateless MCP surface. Every tool should end up in one of three states:

- `verified`: exercised successfully in MCP e2e
- `verified-gated`: exercised through an expected permission / entitlement / config failure path
- `unverified`: implemented but not yet asserted in MCP e2e

## Current snapshot

### Sites

- `list_sites` — `verified`
- `create_site` — `verified`
- `get_site` — `verified`
- `get_site_settings` — `verified`
- `update_site_settings` — `verified`

### Locations

- `list_locations` — `verified`
- `get_location` — `verified`
- `create_location` — `verified`
- `update_location` — `verified`
- `delete_location` — `verified`

### Menus

- `list_menus` — `verified`
- `get_menu` — `verified`
- `create_menu` — `verified`
- `update_menu` — `verified`
- `delete_menu` — `verified`
- `create_menu_item` — `verified`
- `update_menu_item` — `verified`
- `delete_menu_item` — `verified`
- `rename_menu_section` — `verified`
- `delete_menu_section` — `verified`
- `reorder_menu_items` — `verified`

### Posts

- `list_posts` — `verified`
- `get_post` — `verified`
- `create_post` — `verified`
- `update_post` — `verified`
- `publish_post` — `verified`
- `delete_post` — `verified`

### Media

- `list_media_assets` — `verified`
- `request_media_upload` — `verified-gated` when Cloudflare Images is not configured; full upload-confirm-update-delete flow is asserted when config is present
- `confirm_media_upload` — `verified` (conditional on Cloudflare Images configuration)
- `update_media_asset` — `verified` (conditional on successful upload-confirm path)
- `delete_media_asset` — `verified` (conditional on successful upload-confirm path)
- `import_menu_from_media` — `unverified`

### Content

- `get_page_content` — `verified`
- `save_content_draft` — `verified`
- `get_content_draft_status` — `verified`
- `publish_content_drafts` — `verified`
- `discard_content_drafts` — `verified`
- `delete_content_field` — `verified`

### Q&A

- `list_location_qa` — `verified`
- `create_location_qa` — `verified`
- `update_location_qa` — `verified`
- `delete_location_qa` — `verified`
- `reorder_location_qa` — `verified`

### Reviews

- `list_location_reviews` — `verified`
- `reply_to_review` — `verified` for role boundary and not-found path

### Experiences

- `list_experiences` — `verified`
- `get_experience` — `verified`
- `create_experience` — `verified`
- `update_experience` — `verified`
- `delete_experience` — `verified`
- `list_experience_bookings` — `verified`
- `update_experience_booking` — `verified`

### Locales

- `list_locales` — `verified`
- `upsert_locale` — `verified`
- `delete_locale` — `verified`

### Translations

- `get_translation_inventory` — `verified`
- `start_translation_job` — `verified-gated` through the current local AI/config path
- `list_translation_jobs` — `verified`
- `get_translation_job` — `verified`
- `run_translation_job_batch` — `verified-gated` through the current local AI/config path
- `get_translation_review_items` — `verified`
- `save_translation_review_item` — `verified`
- `publish_translations` — `verified`

### Submissions

- `list_contact_submissions` — `verified`
- `update_contact_submission` — `verified`
- `list_reservation_submissions` — `verified`
- `update_reservation_submission` — `verified`

### Notifications

- `get_notification_settings` — `verified`
- `update_notification_settings` — `verified`

### Google Business

- `get_google_business_connection` — `verified`
- `get_google_business_auth_url` — `verified-gated` when config/entitlement path blocks
- `list_google_business_accounts` — `verified-gated` when no Google Business connection exists
- `sync_google_business_locations` — `verified-gated` through the current invalid/not-connected local path

### Managed service

- `list_work_requests` — `verified`
- `create_work_request` — `verified-gated`
