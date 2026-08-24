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
  updated_at?: string | null
  first_published_at?: string | null
  slug_manually_overridden?: boolean | number | null
  scheduled_for?: string | null
  status?: 'published' | 'scheduled'
  visibility?: 'public' | 'unlisted'
  tags?: string[]
  seo_title?: string | null
  primary_image?: { public_url?: string | null; thumbnail_url?: string | null; kind?: string | null } | null
  featured_image?: { public_url?: string | null; thumbnail_url?: string | null; kind?: string | null } | null
  edit_url?: string | null
  content_document?: {
    document: { id: string; updated_at: string }
    blocks: BlogEditorBlock[]
  } | null
  editor_template?: 'saya' | 'blawby' | 'platform'
  editor_theme_tokens?: Record<string, unknown>
  author_name?: string | null
  author_image?: string | null
  site_author_id?: string | null
  created_at?: string | null
  editor_site_name?: string | null
  editor_brand_color?: string | null
  public_path?: string | null
  components?: BlogComponent[]
}

export interface BlogEditorBlock {
  id?: string
  type: string
  position?: number
  level?: number | null
  parent_block_id?: string | null
  data: Record<string, unknown>
  updated_at?: string
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
  content_blocks: BlogEditorBlock[]
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
  visibility?: 'public' | 'unlisted'
  site_author_id?: string | null
  scheduled_for?: string | null
}

export interface PlatformBlogUpdateInput {
  title?: string
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
  visibility?: 'public' | 'unlisted'
  slug?: string | null
  redirect_old_slug?: boolean
  reset_slug_override?: boolean
  content_blocks?: BlogEditorBlock[]
  expected_document_updated_at?: string
  expected_updated_at?: string
  site_author_id?: string | null
}

export interface SiteAuthor {
  id: string
  name: string
  title?: string | null
  bio?: string | null
  image_asset_id?: string | null
  image_public_url?: string | null
  sort_order?: number
}

export interface BlogLifecycleState {
  id: string
  status: 'published' | 'scheduled'
  published_at: string | null
  scheduled_for: string | null
  updated_at: string
  content_document_updated_at: string
}

export interface BlogPostRepository {
  listUrl: string
  editUrl(_postId: string): string
  get(_postId: string): Promise<BlogPost>
  create(_input: PlatformBlogCreateInput): Promise<BlogPost & { id: string }>
  update(_postId: string, _input: PlatformBlogUpdateInput): Promise<BlogPost>
  delete(_postId: string): Promise<void>
  publish(_postId: string, _input: { expected_updated_at: string; expected_document_updated_at: string; scheduled_for?: string | null }): Promise<BlogLifecycleState>
  listAuthors?(): Promise<SiteAuthor[]>
  createAuthor?(_input: { name: string; title?: string | null }): Promise<SiteAuthor>
}
