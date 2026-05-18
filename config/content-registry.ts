export type FieldSource = 'manual' | 'google' | 'static' | 'computed'

export type FieldDefinition = TextField | TextareaField | RichTextField | ImageField | MediaField | MenuItemsField | BusinessHoursField | LocationField | ProductsField;
export type FieldType = FieldDefinition;

interface BaseField {
  label: string;
  sources: FieldSource[];
  defaultValue?: string;
  googlePath?: string;
  placeholder?: string;
  manualInput?: ManualInputConfig;
  integrationConfig?: IntegrationConfig;
  requiredEntitlement?: string;
  googleLocked?: boolean;
  validate?: (_value: string) => string | boolean;
}

export interface TextField extends BaseField {
  type: 'text';
}
export interface TextareaField extends BaseField {
  type: 'textarea';
}
export interface RichTextField extends BaseField {
  type: 'richtext';
}
export interface ImageField extends BaseField {
  type: 'image';
}
export interface MediaField extends BaseField {
  type: 'media';
  mediaKind: 'image' | 'video' | 'any';
}
export interface MenuItemsField extends BaseField {
  type: 'menu_items';
}
export interface BusinessHoursField extends BaseField {
  type: 'business_hours';
}
export interface LocationField extends BaseField {
  type: 'location';
}
export interface ProductsField extends BaseField {
  type: 'products';
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
  /** If true, this page is scoped to a specific location (location/menu pages) */
  locationScoped?: boolean
}

/** Shared validator for social URLs to reject common placeholder patterns */
const _socialUrlValidator = (value: string) => {
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
      'hero.image': {
        label: 'Hero Background Image',
        type: 'media',
        mediaKind: 'image',
        sources: ['manual'],
        defaultValue: ''
      },
      'hero.video': {
        label: 'Hero Background Video',
        type: 'media',
        mediaKind: 'video',
        sources: ['manual'],
        defaultValue: ''
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
        defaultValue: 'About Us',
        placeholder: 'e.g. About Us'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: 'Japanese fire, Southern Thai hospitality',
        placeholder: 'A short tagline shown under the page title'
      },
      'story.image': {
        label: 'Story Image',
        type: 'media',
        mediaKind: 'image',
        sources: ['manual'],
        defaultValue: ''
      },
      'story.title': {
        label: 'Story Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Our Story',
        placeholder: 'e.g. Finding Inspiration in Every Turn'
      },
      'story.body': {
        label: 'Story Body',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'Tell your restaurant\'s story — how it started, what drives you, why it matters.'
      },
      'journey.title': {
        label: 'Journey Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Our Journey',
        placeholder: 'e.g. Our Journey'
      },
      'journey.body': {
        label: 'Journey Body',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: '',
        placeholder: 'Describe the journey — founding story, milestones, what shaped the restaurant.'
      },
      'cta.title': {
        label: 'CTA Heading',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Come dine with us',
        placeholder: 'e.g. Come dine with us'
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
        defaultValue: 'Contact Us',
        placeholder: 'e.g. Contact Us'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: "We'd love to hear from you",
        placeholder: 'A short line shown under the page title'
      }
    }
  },

  location: {
    label: 'Location',
    path: '/location',
    locationScoped: true,
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Location & Hours' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'Visit us in Ao Nang, Krabi' },
      'hero.image': {
        label: 'Hero Image',
        type: 'media',
        mediaKind: 'image',
        sources: ['manual'],
        defaultValue: ''
      },
      'hero.video': {
        label: 'Hero Background Video',
        type: 'media',
        mediaKind: 'video',
        sources: ['manual'],
        defaultValue: ''
      },
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
    locationScoped: true,
    groups: [
      { id: 'hero',   label: 'Hero Section',  icon: 'i-heroicons-photo',        fields: ['hero.title', 'hero.subtitle'] },
      { id: 'items',  label: 'Menu Items',    icon: 'i-heroicons-list-bullet',   fields: ['menu_items'] },
      { id: 'google', label: 'Google Products', icon: 'i-heroicons-circle-stack', fields: ['business.products'] }
    ],
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Our Menu' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'Robatayaki, sushi, and seasonal plates' },
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

  order: {
    label: 'Order Online',
    path: '/order',
    locationScoped: true,
    fields: {
      'hero.title': {
        label: 'Page Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Order Online',
        placeholder: 'e.g. Order Online'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: 'Get our food delivered to your door',
        placeholder: 'A short line shown under the title'
      }
    }
  },

  reservations: {
    label: 'Reservations',
    path: '/reservations',
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Reserve a Table' },
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
