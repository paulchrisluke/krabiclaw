import type { AiTool } from '~/server/utils/ai-gateway'
import { BLOG_CHOWBOT_TOOLS } from './blog'
import { CONTENT_CHOWBOT_TOOLS } from './content'
import { EXPERIENCES_CHOWBOT_TOOLS } from './experiences'
import { INTEGRATIONS_CHOWBOT_TOOLS } from './integrations'
import { LOCALES_CHOWBOT_TOOLS } from './locales'
import { LOCATIONS_CHOWBOT_TOOLS } from './locations'
import { MEDIA_CHOWBOT_TOOLS } from './media'
import { PRODUCTS_CHOWBOT_TOOLS } from './products'
import { POSTS_CHOWBOT_TOOLS } from './posts'
import { QA_CHOWBOT_TOOLS } from './qa'
import { REVIEWS_CHOWBOT_TOOLS } from './reviews'
import { SEARCH_CHOWBOT_TOOLS } from './search'
import { SITES_CHOWBOT_TOOLS } from './sites'
import { SUBMISSIONS_CHOWBOT_TOOLS } from './submissions'

export const CHOWBOT_TOOLS: AiTool[] = [
  ...BLOG_CHOWBOT_TOOLS,
  ...CONTENT_CHOWBOT_TOOLS,
  ...EXPERIENCES_CHOWBOT_TOOLS,
  ...INTEGRATIONS_CHOWBOT_TOOLS,
  ...LOCALES_CHOWBOT_TOOLS,
  ...LOCATIONS_CHOWBOT_TOOLS,
  ...MEDIA_CHOWBOT_TOOLS,
  ...PRODUCTS_CHOWBOT_TOOLS,
  ...POSTS_CHOWBOT_TOOLS,
  ...QA_CHOWBOT_TOOLS,
  ...REVIEWS_CHOWBOT_TOOLS,
  ...SEARCH_CHOWBOT_TOOLS,
  ...SITES_CHOWBOT_TOOLS,
  ...SUBMISSIONS_CHOWBOT_TOOLS,
]

export const CHOWBOT_CONFIRM_REQUIRED = new Set([
  "import_products_from_media",
  "create_post",
  "publish_post",
  "delete_post",
  "delete_blog_post",
  "delete_product",
  "delete_product_category",
  "delete_location",
  "delete_media_asset",
  "delete_location_qa",
  "delete_site_qa",
  "delete_owner_entered_site_review",
  "delete_resource_localization",
  "delete_experience",
  "create_tenant_page",
  "update_tenant_page",
  "change_tenant_page_path",
]);
