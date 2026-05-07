// Menu management types

export interface Menu {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  name: string
  description: string | null
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string | null
}

export interface MenuCategory {
  id: string
  organization_id: string
  site_id: string
  google_category_id: string | null
  name: string
  display_order: number
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface MenuItem {
  id: string
  menu_id: string
  section: string
  category_id: string | null
  name: string
  description: string | null
  price: string | null
  image_url: string | null
  available: boolean
  sort_order: number
  source: 'manual' | 'google_business' | 'other'
  external_id: string | null
  last_synced_at: string | null
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
}

export interface CreateMenuItemRequest {
  section: string
  name: string
  description?: string
  price?: string
  image_url?: string
  available?: boolean
  sort_order?: number
}

export interface UpdateMenuItemRequest {
  section?: string
  name?: string
  description?: string
  price?: string
  image_url?: string
  available?: boolean
  sort_order?: number
}

export interface ReorderMenuItemsRequest {
  items: Array<{
    id: string
    sort_order: number
  }>
}

export interface SiteIntegration {
  id: string
  organization_id: string
  site_id: string
  integration_type: 'google_business' | 'instagram' | 'yelp' | 'other'
  status: 'connected' | 'disconnected' | 'error'
  config: string | null
  last_sync_at: string | null
  sync_errors: string | null
  created_at: string
  updated_at: string
}

export interface CreateMenuCategoryRequest {
  google_category_id?: string
  name: string
  display_order?: number
}

export interface UpdateMenuItemRequest {
  section?: string
  category_id?: string
  name?: string
  description?: string
  price?: string
  image_url?: string
  available?: boolean
  sort_order?: number
}
