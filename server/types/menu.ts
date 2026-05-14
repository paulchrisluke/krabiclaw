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

export interface MenuItem {
  id: string
  menu_id: string
  section: string
  name: string
  slug: string
  description: string | null
  price: string | null
  image_asset_id: string | null
  available: boolean
  sort_order: number
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
  // slug is generated server-side from name
  description?: string
  price?: string
  image_asset_id?: string
  available?: boolean
  sort_order?: number
}

export interface UpdateMenuItemRequest {
  section?: string
  name?: string
  // slug is intentionally not editable via the standard update path
  description?: string
  price?: string
  image_asset_id?: string
  available?: boolean
  sort_order?: number
}

export interface ReorderMenuItemsRequest {
  items: Array<{
    id: string
    sort_order: number
  }>
}
