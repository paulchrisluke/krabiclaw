export type FieldSource = 'manual' | 'google' | 'static' | 'computed'
export type FieldType = 'text' | 'richtext' | 'image' | 'menu_items' | 'business_hours' | 'location'

export interface FieldDefinition {
  label: string
  type: FieldType
  sources: FieldSource[] // Array of allowed sources for this field
  defaultValue?: string
  /** For google fields: dot-path into the google business object */
  googlePath?: string
  placeholder?: string
  /** Manual input configuration */
  manualInput?: ManualInputConfig
  /** Integration configuration */
  integrationConfig?: IntegrationConfig
  /** Feature gating */
  requiredEntitlement?: string
}

export interface ManualInputConfig {
  type: 'simple' | 'structured' | 'editor'
  helperText?: string
  validation?: ValidationRule[]
}

export interface IntegrationConfig {
  type: 'google_business' | 'instagram' | 'yelp' | 'other'
  syncDirection: 'import' | 'export' | 'two_way'
  conflictResolution: 'manual_wins' | 'integration_wins'
}

export interface ValidationRule {
  type: 'required' | 'email' | 'phone' | 'url' | 'numeric'
  message?: string
}

export interface PageDefinition {
  label: string
  path: string
  fields: Record<string, FieldDefinition>
  groups?: Array<{ id: string; label: string; icon: string; fields: string[] }>
}

export const contentRegistry: Record<string, PageDefinition> = {
  home: {
    label: 'Home',
    path: '/',
    fields: {
      'hero.title': {
        label: 'Hero Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Your Restaurant',
        placeholder: 'Enter hero title...'
      },
      'hero.subtitle': {
        label: 'Hero Subtitle',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Authentic Experience in your city',
        placeholder: 'Enter hero subtitle...'
      },
      'hero.video': {
        label: 'Hero Background Video URL',
        type: 'text',
        sources: ['manual'],
        defaultValue: '/videos/hero-video.mp4'
      },
      'cta.title': {
        label: 'CTA Heading',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Ready to Experience OUR RESTAURANT?'
      },
      'cta.description': {
        label: 'CTA Description',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: "Whether you're joining us for a casual dinner or a special celebration, we look forward to serving you the finest authentic cuisine in your city."
      },
      'business.name': {
        label: 'Business Name',
        type: 'text',
        sources: ['manual', 'google'],
        googlePath: 'title',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.establishment_year': {
        label: 'Establishment Year',
        type: 'text',
        sources: ['manual', 'google'],
        googlePath: 'establishmentYear',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.description': {
        label: 'Business Description',
        type: 'richtext',
        sources: ['manual', 'google'],
        googlePath: 'profile.description',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.address': {
        label: 'Address',
        type: 'text',
        sources: ['manual', 'google'],
        googlePath: 'storefrontAddress',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.phone': {
        label: 'Phone',
        type: 'text',
        sources: ['manual', 'google'],
        googlePath: 'phoneNumbers.0.phoneNumber',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.hours': {
        label: 'Opening Hours',
        type: 'business_hours',
        sources: ['manual', 'google'],
        googlePath: 'regularHours',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.photos': {
        label: 'Photos',
        type: 'image',
        sources: ['manual', 'google'],
        googlePath: 'media',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'import',
          conflictResolution: 'integration_wins'
        }
      }
    }
  },

  about: {
    label: 'About',
    path: '/about',
    fields: {
      'hero.title': {
        label: 'Page Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'About OUR RESTAURANT'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Authentic Experience in your city'
      },
      'story.intro': {
        label: 'Story Introduction',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<p class="text-xl font-medium text-gray-900 border-l-4 border-black pl-6 py-2">Our Restaurant authentic Restaurant, nestled in the heart of your city, is a culinary haven that specializes in the artful fusion of fine dining.</p>'
      },
      'grill.title': {
        label: 'Grill Section Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Mastery of the Grill'
      },
      'grill.description': {
        label: 'Grill Description',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: 'Renowned for its authentic cuisine, Our Restaurant showcases a mastery of grilling techniques, presenting a delectable array of skewered delights.'
      },
      'sushi.title': {
        label: 'Sushi Section Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Artistry in Sushi'
      },
      'sushi.description': {
        label: 'Sushi Description',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: "Complementing the authentic cuisine experience is Our Restaurant's sushi selection, where skilled chefs artfully craft a variety of sushi rolls."
      },
      'journey.title': {
        label: 'Journey Section Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Our Journey'
      },
      'journey.body': {
        label: 'Journey Body',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<p>Nestled amidst the tropical allure of your city, Our Restaurant has an enchanting culinary tale.</p>'
      },
      'experience.body': {
        label: 'Experience Description',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<p>Equally enticing is our sushi bar, a stage where culinary craftsmen orchestrate amazing flavors and textures.</p>'
      },
      'business.establishment_year': { 
        label: 'Establishment Year', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'establishmentYear',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.description': { 
        label: 'Google Business Description', 
        type: 'richtext', 
        sources: ['manual', 'google'], 
        googlePath: 'profile.description',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      }
    }
  },

  contact: {
    label: 'Contact',
    path: '/contact',
    fields: {
      'hero.title': {
        label: 'Page Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Contact Us'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Get in Touch with OUR RESTAURANT'
      },
      'intro.body': {
        label: 'Introduction Text',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<p>For an unparalleled authentic culinary experience in your city, Our Restaurant beckons you to transcend the virtual and savor the exquisite reality.</p>'
      },
      'social.facebook': {
        label: 'Facebook URL',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'https://www.facebook.com/your-restaurant'
      },
      'social.instagram': {
        label: 'Instagram URL',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'https://www.instagram.com/your-restaurant'
      },
      'business.name': { 
        label: 'Business Name', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'title',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.establishment_year': { 
        label: 'Establishment Year', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'establishmentYear',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.address': { 
        label: 'Address', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'storefrontAddress',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.phone': { 
        label: 'Phone', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'phoneNumbers.0.phoneNumber',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.hours': { 
        label: 'Hours', 
        type: 'business_hours', 
        sources: ['manual', 'google'], 
        googlePath: 'regularHours',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      }
    }
  },

  location: {
    label: 'Location',
    path: '/location',
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Location & Hours' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'text', sources: ['manual'], defaultValue: 'Visit Us in your city' },
      'parking.info': {
        label: 'Parking Information',
        type: 'richtext',
        sources: ['manual'],
        placeholder: 'Add parking instructions for guests...'
      },
      'extra.notes': {
        label: 'Additional Notes',
        type: 'richtext',
        sources: ['manual'],
        placeholder: 'Any additional location notes...'
      },
      'business.name': { 
        label: 'Business Name', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'title',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.establishment_year': { 
        label: 'Establishment Year', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'establishmentYear',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.address': { 
        label: 'Address', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'storefrontAddress',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.phone': { 
        label: 'Phone', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'phoneNumbers.0.phoneNumber',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      },
      'business.hours': { 
        label: 'Hours', 
        type: 'business_hours', 
        sources: ['manual', 'google'], 
        googlePath: 'regularHours',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'two_way',
          conflictResolution: 'integration_wins'
        }
      }
    }
  },

  menu: {
    label: 'Menu',
    path: '/menu',
    groups: [
      { id: 'hero',    label: 'Hero Section',      icon: '🎯', fields: ['hero.title', 'hero.subtitle'] },
      { id: 'content', label: 'Menu Introduction', icon: '📝', fields: ['description'] },
      { id: 'items',   label: 'Menu Items',        icon: '🍽', fields: ['menu_items'] },
      { id: 'google',  label: 'Google Products',   icon: '🔵', fields: ['business.products'] }
    ],
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Our Menu' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'text', sources: ['manual'], defaultValue: 'Authentic Dining' },
      'description': {
        label: 'Menu Introduction',
        type: 'richtext',
        sources: ['manual'],
        placeholder: 'Add a menu introduction or description...'
      },
      'menu_items': {
        label: 'Menu Items',
        type: 'menu_items',
        sources: ['manual']
      },
      'business.products': { 
        label: 'Google Products', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'products',
        integrationConfig: {
          type: 'google_business',
          syncDirection: 'import',
          conflictResolution: 'integration_wins'
        }
      }
    }
  },

  reservations: {
    label: 'Reservations',
    path: '/reservations',
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Reserve a Table at OUR RESTAURANT' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'text', sources: ['manual'], defaultValue: 'Book Your Authentic Experience' },
      'policies.body': {
        label: 'Reservation Policies',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<ul><li>Reservations are held for 15 minutes</li><li>Cancellations required 2 hours in advance</li><li>Large parties (6+ guests) may require deposit</li><li>Special dietary requests accommodated with advance notice</li></ul>'
      },
      'contact.phone': {
        label: 'Contact Phone',
        type: 'text',
        sources: ['manual'],
        defaultValue: '+66 81 154 3606'
      },
      'contact.email': {
        label: 'Contact Email',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'info@your-restaurant.com'
      }
    }
  }
}

/** All editable public pages (for the page selector) */
export const editablePages: Array<{ label: string; path: string }> = Object.values(contentRegistry).map(p => ({
  label: p.label,
  path: p.path
}))

/** Get a field definition for a page+field key */
export const getFieldDef = (page: string, field: string): FieldDefinition | undefined => {
  return contentRegistry[page]?.fields[field]
}
