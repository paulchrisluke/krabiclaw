export type FieldSource = 'manual' | 'google' | 'static' | 'computed'
export type FieldType = 'text' | 'textarea' | 'richtext' | 'image' | 'menu_items' | 'business_hours' | 'location' | 'products'

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
  /** Google Business upsell gate for fields that can sync from Google */
  googleLocked?: boolean
  /** Custom validation function */
  validate?: (value: string) => string | boolean
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

/** Shared validator for social URLs to reject common placeholder patterns */
const socialUrlValidator = (value: string) => {
  if (!value) return true
  const lowerValue = value.toLowerCase()
  if (lowerValue.includes('your-restaurant')) {
    return 'Please replace the placeholder with your actual profile name/ID'
  }
  
  try {
    const url = new URL(value)
    // Reject if it's just the domain e.g. "https://facebook.com/"
    if (url.pathname === '/' || url.pathname === '') {
      return 'Please enter the full URL to your social media profile'
    }
    return true
  } catch {
    // If it's not a valid URL yet, we'll let the built-in 'url' validator (if any) handle it, 
    // but here we just check for placeholder patterns.
    return true
  }
}

export const contentRegistry: Record<string, PageDefinition> = {
  home: {
    label: 'Home',
    path: '/',
    fields: {
      'hero.eyebrow': {
        label: 'Hero Eyebrow',
        type: 'text',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'e.g. A neighbourhood izakaya'
      },
      'hero.title': {
        label: 'Hero Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Saya Kitchen',
        placeholder: 'Enter hero title...'
      },
      'hero.subtitle': {
        label: 'Hero Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: 'Authentic Japanese Robatayaki in Krabi, Thailand',
        placeholder: 'Enter hero subtitle...'
      },
      'story.headline': {
        label: 'Brand Story Headline',
        type: 'text',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'e.g. Charcoal & salt.'
      },
      'story.body': {
        label: 'Brand Story',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'Two or three sentences about your restaurant — what you cook, how you cook it, why it matters.'
      },
      'cta.title': {
        label: 'Hero Background Video URL',
        type: 'text',
        sources: ['manual'],
        defaultValue: '/videos/hero-video.mp4'
      },
      'cta.title': {
        label: 'CTA Heading',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Ready to Experience Saya Kitchen?'
      },
      'cta.description': {
        label: 'CTA Description',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: "From our open-flame robatayaki grill to hand-rolled sushi, every dish at Saya is crafted with intention. Join us for an evening you won't forget."
      },
      'business.name': {
        label: 'Business Name',
        type: 'text',
        sources: ['manual', 'google'],
        googlePath: 'title',
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        defaultValue: 'About Saya Kitchen'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: 'Japanese fire, Southern Thai hospitality'
      },
      'story.intro': {
        label: 'Story Introduction',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<p class="text-xl font-medium text-gray-900 border-l-4 border-black pl-6 py-2">Saya Kitchen brings the warmth of Japanese robatayaki to Krabi, pairing open-flame cooking with pristine seafood, seasonal produce, and generous island hospitality.</p>'
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
        defaultValue: 'Our chefs work over glowing charcoal, turning seafood, vegetables, and skewers slowly so each dish carries smoke, texture, and quiet precision.'
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
        defaultValue: "Alongside the grill, Saya's sushi counter serves clean, balanced rolls and sashimi shaped by fresh ingredients and careful hands."
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
        defaultValue: '<p>Founded as a neighborhood dining room for travelers and locals, Saya Kitchen was created around one simple idea: honest Japanese cooking served with the ease of Krabi nights.</p>'
      },
      'experience.body': {
        label: 'Experience Description',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<p>Settle in for grilled skewers, chilled sake, bright sushi, and a room that moves at the pace of a long dinner with friends.</p>'
      },
      'business.establishment_year': { 
        label: 'Establishment Year', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'establishmentYear',
        googleLocked: true,
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
        googleLocked: true,
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
        defaultValue: 'Contact Saya Kitchen'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: 'Book a table or ask us anything'
      },
      'intro.body': {
        label: 'Introduction Text',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '<p>Whether you are planning dinner, a celebration, or a quiet seat at the counter, the Saya team is here to help.</p>'
      },
      'footer.tagline': {
        label: 'Footer Tagline',
        type: 'text',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'e.g. Authentic dining, crafted with passion.'
      },
      'social.facebook': {
        label: 'Facebook URL',
        type: 'text',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'https://www.facebook.com/your-restaurant',
        validate: socialUrlValidator
      },
      'social.instagram': {
        label: 'Instagram URL',
        type: 'text',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'https://www.instagram.com/your-restaurant',
        validate: socialUrlValidator
      },
      'social.tiktok': {
        label: 'TikTok URL',
        type: 'text',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'https://www.tiktok.com/@your-restaurant',
        validate: socialUrlValidator
      },

      'business.name': { 
        label: 'Business Name', 
        type: 'text', 
        sources: ['manual', 'google'], 
        googlePath: 'title',
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'Visit us in Ao Nang, Krabi' },
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
        googleLocked: true,
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
      { id: 'hero',    label: 'Hero Section',      icon: 'i-heroicons-photo', fields: ['hero.title', 'hero.subtitle'] },
      { id: 'content', label: 'Menu Introduction', icon: 'i-heroicons-document-text', fields: ['description'] },
      { id: 'items',   label: 'Menu Items',        icon: 'i-heroicons-list-bullet', fields: ['menu_items'] },
      { id: 'google',  label: 'Google Products',   icon: 'i-heroicons-circle-stack', fields: ['business.products'] }
    ],
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Saya Menu' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'Robatayaki, sushi, and seasonal plates' },
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
        type: 'products', 
        sources: ['manual', 'google'], 
        googlePath: 'products',
        googleLocked: true,
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
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Reserve a Table at Saya Kitchen' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'Plan your evening around the grill' },
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
        defaultValue: 'hello@sayakitchen.example'
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
