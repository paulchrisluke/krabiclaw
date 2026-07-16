export interface BlogPost {
  id: string
  title: string
  slug?: string | null
  excerpt?: string | null
  category?: string | null
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
  featured_order?: number | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  body: string
  published_at?: string | null
  public_path?: string | null
  components?: BlogComponent[]
}

export interface BlogComponent {
  type: 'faq' | 'how_to' | 'ai_assistance'
  label?: string | null
  status?: 'active' | 'inactive' | null
  render_enabled?: boolean | null
  schema_enabled?: boolean | null
  data?: {
    items?: Array<{ question?: string | null; answer?: string | null }>
    steps?: Array<{ name?: string | null; text?: string | null; image_asset_id?: string | null; url?: string | null }>
    prompts?: Array<{ title?: string | null; prompt?: string | null; description?: string | null; copy_label?: string | null }>
  } | null
}

export interface PlatformBlogCreateInput {
  title: string
  body: string
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
  featured_order?: number | null
  faq_items?: Array<{ question: string; answer: string; position?: number | null }>
  faq_label?: string | null
  faq_status?: 'active' | 'inactive' | null
  faq_render_enabled?: boolean
  faq_schema_enabled?: boolean
  how_to_steps?: Array<{ name: string; text: string; image_asset_id?: string | null; url?: string | null; position?: number | null }>
  how_to_estimated_time?: string | null
  how_to_tool_items?: string[]
  how_to_supply_items?: string[]
  how_to_label?: string | null
  how_to_status?: 'active' | 'inactive' | null
  how_to_render_enabled?: boolean
  how_to_schema_enabled?: boolean
  components?: BlogComponent[]
  publish?: boolean
}

export interface PlatformBlogUpdateInput {
  title?: string
  body?: string
  excerpt?: string | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  featured_image_asset_id?: string | null
  nav_section?: string | null
  nav_title?: string | null
  nav_order?: number | null
  nav_section_order?: number | null
  hide_from_nav?: boolean | number | null
  featured_order?: number | null
  faq_items?: Array<{ question: string; answer: string; position?: number | null }>
  faq_label?: string | null
  faq_status?: 'active' | 'inactive' | null
  faq_render_enabled?: boolean
  faq_schema_enabled?: boolean
  how_to_steps?: Array<{ name: string; text: string; image_asset_id?: string | null; url?: string | null; position?: number | null }>
  how_to_estimated_time?: string | null
  how_to_tool_items?: string[]
  how_to_supply_items?: string[]
  how_to_label?: string | null
  how_to_status?: 'active' | 'inactive' | null
  how_to_render_enabled?: boolean
  how_to_schema_enabled?: boolean
  components?: BlogComponent[]
  publish?: boolean
  unpublish?: boolean
}

export interface BlogPostRepository {
  listUrl: string
  editUrl(_postId: string): string
  get(_postId: string): Promise<BlogPost>
  create(_input: PlatformBlogCreateInput): Promise<BlogPost & { id: string }>
  update(_postId: string, _input: PlatformBlogUpdateInput): Promise<BlogPost>
  delete(_postId: string): Promise<void>
  publish(_postId: string): Promise<void>
  unpublish(_postId: string): Promise<void>
}
