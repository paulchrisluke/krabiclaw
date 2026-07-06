import type { AiTool } from '~/server/utils/ai-gateway'
import { BLOG_CHOWBOT_TOOLS } from './blog'
import { CONTENT_CHOWBOT_TOOLS } from './content'
import { EXPERIENCES_CHOWBOT_TOOLS } from './experiences'
import { INTEGRATIONS_CHOWBOT_TOOLS } from './integrations'
import { LOCATIONS_CHOWBOT_TOOLS } from './locations'
import { MANAGED_SERVICE_CHOWBOT_TOOLS } from './managed-service'
import { MEDIA_CHOWBOT_TOOLS } from './media'
import { MENUS_CHOWBOT_TOOLS } from './menus'
import { NOTIFICATIONS_CHOWBOT_TOOLS } from './notifications'
import { POSTS_CHOWBOT_TOOLS } from './posts'
import { QA_CHOWBOT_TOOLS } from './qa'
import { REVIEWS_CHOWBOT_TOOLS } from './reviews'
import { SETTINGS_CHOWBOT_TOOLS } from './settings'
import { SITES_CHOWBOT_TOOLS } from './sites'
import { SUBMISSIONS_CHOWBOT_TOOLS } from './submissions'
import { TRANSLATIONS_CHOWBOT_TOOLS } from './translations'

export const CHOWBOT_TOOLS: AiTool[] = [
  ...BLOG_CHOWBOT_TOOLS,
  ...CONTENT_CHOWBOT_TOOLS,
  ...EXPERIENCES_CHOWBOT_TOOLS,
  ...INTEGRATIONS_CHOWBOT_TOOLS,
  ...LOCATIONS_CHOWBOT_TOOLS,
  ...MANAGED_SERVICE_CHOWBOT_TOOLS,
  ...MEDIA_CHOWBOT_TOOLS,
  ...MENUS_CHOWBOT_TOOLS,
  ...NOTIFICATIONS_CHOWBOT_TOOLS,
  ...POSTS_CHOWBOT_TOOLS,
  ...QA_CHOWBOT_TOOLS,
  ...REVIEWS_CHOWBOT_TOOLS,
  ...SETTINGS_CHOWBOT_TOOLS,
  ...SITES_CHOWBOT_TOOLS,
  ...SUBMISSIONS_CHOWBOT_TOOLS,
  ...TRANSLATIONS_CHOWBOT_TOOLS,
]

export const CHOWBOT_CONFIRM_REQUIRED = new Set([
  "create_post",
  "publish_post",
  "delete_post",
  "delete_blog_post",
  "publish_menu",
  "delete_menu",
  "delete_menu_item",
  "delete_menu_section",
  "delete_location",
  "delete_media_asset",
  "delete_location_qa",
  "delete_content_field",
  "delete_locale",
  "start_translation_job",
  "run_translation_job_batch",
  "publish_translations",
  "delete_experience",
  "create_work_request",
]);
