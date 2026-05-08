// Content seeding utilities for Saya theme
// Generic restaurant content, not Kikuzuki-specific

export interface SeedContentData {
  organizationId: string
  siteId: string
  restaurantName: string
}

// Get platform domain from environment
function getPlatformDomain(): string {
  const domain = process.env.NUXT_PUBLIC_FREE_SITE_DOMAIN
  if (!domain) {
    throw new Error('NUXT_PUBLIC_FREE_SITE_DOMAIN environment variable is required for content seeding')
  }
  return domain
}

// Generate unique ID helper
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Generic Saya theme content for new restaurants
export const getSayaThemeSeedContent = (data: SeedContentData) => {
  const now = new Date().toISOString()
  
  return [
    // Homepage content
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null, // Site-wide content
      page: 'home',
      field: 'hero.title',
      content: `Welcome to ${data.restaurantName}`,
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'hero.subtitle',
      content: 'Experience authentic flavors and warm hospitality',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'hero.cta_title',
      content: 'Reserve Your Table',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'hero.cta_description',
      content: 'Join us for an unforgettable dining experience',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'about.title',
      content: 'Our Story',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'home',
      field: 'about.description',
      content: 'We are passionate about creating exceptional dining experiences using the finest ingredients and traditional techniques.',
      type: 'textarea',
      updated_at: now
    },
    // Contact page content
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.phone',
      content: '+1 (555) 123-4567',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.email',
      content: 'info@' + data.siteId + '.' + getPlatformDomain(),
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.address',
      content: '123 Restaurant Street, City, State 12345',
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'contact',
      field: 'contact.hours',
      content: 'Mon-Sun: 11:00 AM - 10:00 PM',
      type: 'text',
      updated_at: now
    },
    // SEO content
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'seo',
      field: 'meta.title',
      content: `${data.restaurantName} | Restaurant`,
      type: 'text',
      updated_at: now
    },
    {
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null,
      page: 'seo',
      field: 'meta.description',
      content: `Experience exceptional dining at ${data.restaurantName}. Reserve your table today!`,
      type: 'text',
      updated_at: now
    }
  ]
}

// Seed default menu for new restaurants
export const getDefaultMenuSeedData = (data: SeedContentData) => {
  const now = new Date().toISOString()
  const menuId = `${data.siteId}-default-menu`
  
  return {
    menu: {
      id: menuId,
      organization_id: data.organizationId,
      site_id: data.siteId,
      location_id: null, // Site-wide menu
      name: 'Main Menu',
      status: 'active',
      created_at: now,
      updated_at: now
    },
    items: [
      // Appetizers
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Appetizers',
        name: 'Fresh Spring Rolls',
        description: 'Crispy vegetables wrapped in rice paper, served with peanut sauce',
        price: '$8.95',
        available: 1,
        sort_order: 1,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Appetizers',
        name: 'Soup of the Day',
        description: 'Chef\'s special soup, ask your server for today\'s selection',
        price: '$6.95',
        available: 1,
        sort_order: 2,
        created_at: now,
        updated_at: now
      },
      // Main Courses
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Main Courses',
        name: 'Grilled Salmon',
        description: 'Fresh Atlantic salmon grilled to perfection, served with seasonal vegetables',
        price: '$24.95',
        available: 1,
        sort_order: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Main Courses',
        name: 'Beef Stir-Fry',
        description: 'Tender beef with mixed vegetables in our special sauce',
        price: '$18.95',
        available: 1,
        sort_order: 11,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Main Courses',
        name: 'Vegetable Pad Thai',
        description: 'Classic Thai rice noodles with tofu and fresh vegetables',
        price: '$16.95',
        available: 1,
        sort_order: 12,
        created_at: now,
        updated_at: now
      },
      // Desserts
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Desserts',
        name: 'Chocolate Lava Cake',
        description: 'Warm chocolate cake with molten center, served with vanilla ice cream',
        price: '$8.95',
        available: 1,
        sort_order: 20,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Desserts',
        name: 'Fresh Fruit Sorbet',
        description: 'Daily selection of seasonal fruit sorbets',
        price: '$6.95',
        available: 1,
        sort_order: 21,
        created_at: now,
        updated_at: now
      },
      // Beverages
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Beverages',
        name: 'House Wine',
        description: 'Red or white wine by the glass',
        price: '$9.95',
        available: 1,
        sort_order: 30,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Beverages',
        name: 'Craft Beer Selection',
        description: 'Local and imported craft beers',
        price: '$7.95',
        available: 1,
        sort_order: 31,
        created_at: now,
        updated_at: now
      },
      {
        id: generateId('item'),
        menu_id: menuId,
        section: 'Beverages',
        name: 'Fresh Juice',
        description: 'Orange, apple, or carrot juice',
        price: '$4.95',
        available: 1,
        sort_order: 32,
        created_at: now,
        updated_at: now
      }
    ]
  }
}
