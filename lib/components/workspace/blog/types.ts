import type { ArticleCollection } from '~/utils/article-collections'

export interface BlogPost {
  id: string
  title: string
  slug?: string | null
  excerpt?: string | null
  /** Which of the site's collections the article belongs to; customer templates only have the blog. */
  collection?: ArticleCollection | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  published_at?: string | null
  updated_at: string
  first_published_at?: string | null
  slug_manually_overridden?: boolean | number | null
  scheduled_for?: string | null
  status?: 'draft' | 'published' | 'scheduled'
  visibility?: 'listed' | 'unlisted'
  tags?: string[]
  seo_title?: string | null
  /** The leading image block's asset, or null when the article opens with text. */
  cover?: { asset_id: string; public_url?: string | null; thumbnail_url?: string | null; kind?: string | null; alt_text?: string | null; width?: number | null; height?: number | null } | null
  edit_url?: string | null
  content_document?: {
    document: { id: string; updated_at: string }
    blocks: BlogEditorBlock[]
  } | null
  editor_template?: 'saya' | 'blawby' | 'platform'
  editor_theme_tokens?: Record<string, unknown>
  created_at?: string | null
  editor_site_name?: string | null
  editor_brand_color?: string | null
  public_path?: string | null
}

export interface BlogEditorBlock {
  id?: string
  type: string
  position?: number
  level?: number | null
  parent_block_id?: string | null
  data: Record<string, unknown>
  media?: Array<{ asset_id: string; slot: string; sort_order?: number; public_url?: string | null; thumbnail_url?: string | null; kind?: string | null; alt_text?: string | null; caption?: string | null }>
  updated_at?: string
}

export interface BlogPostCreateInput {
  title: string
  slug?: string | null
  content_blocks: BlogEditorBlock[]
  excerpt?: string | null
  collection?: ArticleCollection | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  visibility?: 'listed' | 'unlisted'
  scheduled_for?: string | null
}

export interface BlogPostUpdateInput {
  title?: string
  excerpt?: string | null
  collection?: ArticleCollection | null
  category?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  visibility?: 'listed' | 'unlisted'
  slug?: string | null
  redirect_old_slug?: boolean
  reset_slug_override?: boolean
  content_blocks?: BlogEditorBlock[]
  expected_updated_at?: string
}

export interface BlogLifecycleState {
  id: string
  status: 'draft' | 'published' | 'scheduled'
  published_at: string | null
  scheduled_for: string | null
  updated_at: string
}

export interface BlogPostRepository {
  listUrl: string
  editUrl(_postId: string): string
  get(_postId: string): Promise<BlogPost>
  create(_input: BlogPostCreateInput): Promise<BlogPost & { id: string }>
  update(_postId: string, _input: BlogPostUpdateInput): Promise<BlogPost>
  delete(_postId: string): Promise<void>
  publish(_postId: string, _input: { expected_updated_at: string; scheduled_for?: string | null }): Promise<BlogLifecycleState>
}
