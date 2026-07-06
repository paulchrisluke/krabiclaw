// Menu management types

export interface Menu {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  name: string
  description: string | null
  status: 'draft' | 'published'
  section_order: string[] | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string | null
}

export interface MenuItem {
  id: string
  menu_id: string
  section: string
  name: string
  slug: string
  description: string | null
  price_amount: string | number | null
  compare_at_price_amount: string | number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  image_asset_id: string | null
  public_url?: string | null  // from media_assets join
  kind?: string | null
  available: boolean
  featured: boolean
  featured_sort_order: number
  sort_order: number
  allergens?: string[] | null
  ingredients?: string[] | null
  dietary_notes?: string[] | null
  preparation?: string | null
  serving_note?: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string | null
}

export interface MenuWithItems extends Menu {
  items: MenuItem[]
}

export interface CreateMenuRequest {
  name: string
  description?: string
  locationId?: string | null
}

export interface UpdateMenuRequest {
  name?: string
  description?: string
  status?: 'draft' | 'published'
  section_order?: string[]
}

export interface CreateMenuItemRequest {
  section: string
  name: string
  // slug is generated server-side from name
  description?: string
  price_amount?: string | number | null
  compare_at_price_amount?: string | number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  image_asset_id?: string | null
  available?: boolean
  featured?: boolean
  featured_sort_order?: number
  sort_order?: number
  allergens?: string[]
  ingredients?: string[]
  dietary_notes?: string[]
  preparation?: string
  serving_note?: string
}

export interface UpdateMenuItemRequest {
  section?: string
  name?: string
  // slug is intentionally not editable via the standard update path
  description?: string
  price_amount?: string | number | null
  compare_at_price_amount?: string | number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  image_asset_id?: string | null
  available?: boolean
  featured?: boolean
  featured_sort_order?: number
  sort_order?: number
  allergens?: string[]
  ingredients?: string[]
  dietary_notes?: string[]
  preparation?: string
  serving_note?: string
}

export interface ReorderMenuItemsRequest {
  items: Array<{
    id: string
    sort_order: number
  }>
}
