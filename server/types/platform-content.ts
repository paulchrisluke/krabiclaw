import type { PlatformContentComponentInput } from '~/server/utils/platform-content'

export interface PlatformStructuredContentRequestBody {
  faq_items?: Array<{ question: string; answer: string }>
  faq_label?: string
  faq_status?: 'active' | 'inactive'
  faq_render_enabled?: boolean
  faq_schema_enabled?: boolean
  how_to_steps?: Array<{ name: string; text: string; image_asset_id?: string; url?: string }>
  how_to_estimated_time?: string
  how_to_tool_items?: string[]
  how_to_supply_items?: string[]
  how_to_label?: string
  how_to_status?: 'active' | 'inactive'
  how_to_render_enabled?: boolean
  how_to_schema_enabled?: boolean
  components?: PlatformContentComponentInput[]
}

export interface PlatformBlogPostRequestBody extends PlatformStructuredContentRequestBody {
  title?: string
  body?: string
  excerpt?: string
  category?: string
  seo_description?: string
  seo_keywords?: string
  canonical_url?: string
  robots?: string
  featured_image_asset_id?: string
  publish?: boolean
  unpublish?: boolean
}

export interface PlatformDocRequestBody extends PlatformStructuredContentRequestBody {
  title?: string
  body?: string
  excerpt?: string
  category?: string
  seo_description?: string
  seo_keywords?: string
  canonical_url?: string
  robots?: string
  difficulty_level?: string
  sort_order?: number
  parent_doc_id?: string
  featured_image_asset_id?: string
  publish?: boolean
  unpublish?: boolean
}
