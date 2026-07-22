import type { SiteVertical } from '~/utils/vertical-copy'
import { cmsCapabilityRegistry, resolveCmsCapabilities, type CmsCapabilityDefinition } from '~/config/cms-registry'

export type FieldSource = 'manual' | 'google' | 'static' | 'computed'

export type FieldDefinition = TextField | TextareaField | RichTextField | ImageField | MediaField;
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

export interface PageGroupDefinition {
  id: string
  label: string
  icon: string
  fields: string[]
}

export interface PreviewContext {
  locationSlug?: string
}

export interface PageDefinition {
  label: string
  path: string
  fields: Record<string, FieldDefinition>
  groups: PageGroupDefinition[]
  /** Verticals that see this page in the CMS page selector and page inventory. */
  verticals: SiteVertical[]
  scope: 'site' | 'location'
  /** Resolves the public preview path. Defaults to the page's static `path` when omitted. */
  preview?: {
    resolvePath: (_context: PreviewContext) => string
  }
}

export interface EditablePage {
  id: string
  label: string
  path: string
  scope: 'site' | 'location'
  scopeLabelKey: 'site' | 'location' | 'office'
}

/** Resolves the visible page inventory for a tenant's vertical — the one source of truth for
 *  the CMS page selector (content.vue) and the page inventory list (pages.vue). */
export function getEditablePages(vertical: SiteVertical, template: PublicTemplateSlug): EditablePage[] {
  const capability = resolveCmsCapabilities(vertical, template)
  return capability.pages.map(page => ({
      id: page.id,
      label: page.label,
      path: page.route,
      scope: page.scope,
      scopeLabelKey: page.scope === 'site'
        ? 'site'
        : capability.locationVocabulary === 'office/service area' ? 'office' : 'location',
    }))
}

/** Resolves the editable pages a CMS host (editor sidebar, index grid) should list for one
 *  scope — the one place that intersects a template's editable-page inventory with the
 *  capabilities the tenant's vertical/template combination actually exposes. blawby has no
 *  field-editable pages yet (professional_services editor gap, issue #323), so it always
 *  returns an empty list rather than pages that would 400 against assertSiteContentPage. */
export function getScopedEditablePages(
  vertical: SiteVertical | null,
  capabilities: CmsCapabilityDefinition | null,
  scope: 'site' | 'location',
): EditablePage[] {
  if (!vertical || !capabilities || capabilities.template === 'blawby') return []
  const allowedPageIds = new Set(capabilities.pages.map(page => page.id))
  return getEditablePages(vertical, capabilities.template)
    .filter(page => allowedPageIds.has(page.id) && page.scope === scope)
}

/** Builds the URL a real visitor would see for a resolved page path — the one place that
 *  formats domain + path (treating the root path as no suffix), shared by every "visitor
 *  display URL" bar (CmsContentEditor's header, OnboardingPreviewPane's toolbar). Each caller
 *  still resolves its own `path` — they have different page inventories available (a full
 *  location-aware CMS page list vs. onboarding's fixed home/offerings/about/contact tabs). */
export function buildDisplayUrl(domain: string, path: string): string {
  if (!domain) return ''
  return domain + (path === '/' ? '' : path)
}

/** Resolves the public preview path for a page, given the currently selected location (if any). */
export function resolvePreviewPath(pageId: string, context: PreviewContext): string {
  const candidates = cmsCapabilityRegistry.flatMap(capability => capability.pages).filter(page => page.id === pageId)
  if (!candidates.length) throw new Error(`Unknown CMS page: ${pageId}`)
  const route = candidates[0]!.route
  if (route.includes(':location') && !context.locationSlug) {
    throw new Error(`CMS page "${pageId}" requires an explicit location slug`)
  }
  return route.replace(':location', context.locationSlug ?? '')
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
    verticals: ['restaurant', 'experience', 'professional_service'],
    scope: 'site',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-image', fields: ['hero.eyebrow', 'hero.title', 'hero.subtitle', 'hero.image', 'hero.video'] },
      { id: 'story', label: 'Brand Story', icon: 'i-lucide-book-open', fields: ['story.headline', 'story.body', 'story.image'] },
      { id: 'cta', label: 'Call to Action', icon: 'i-lucide-megaphone', fields: ['cta.title', 'cta.description'] },
    ],
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
        defaultValue: 'Welcome',
        placeholder: 'Enter hero title...'
      },
      'hero.subtitle': {
        label: 'Hero Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: 'Tell visitors what makes your business worth a visit.',
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
      'story.image': {
        label: 'Story Image',
        type: 'media',
        mediaKind: 'image',
        sources: ['manual'],
        defaultValue: ''
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
        defaultValue: 'Talk about your business'
      },
      'cta.description': {
        label: 'CTA Description',
        type: 'richtext',
        sources: ['manual'],
        defaultValue: 'Share what makes your business worth visiting, and invite customers to take the next step.'
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
    verticals: ['restaurant', 'experience', 'professional_service'],
    scope: 'site',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-image', fields: ['hero.title', 'hero.subtitle'] },
      { id: 'story', label: 'Story', icon: 'i-lucide-book-open', fields: ['story.image', 'story.headline', 'story.body'] },
      { id: 'journey', label: 'Journey', icon: 'i-lucide-map', fields: ['journey.title', 'journey.body'] },
      { id: 'cta', label: 'Call to Action', icon: 'i-lucide-megaphone', fields: ['cta.title'] },
    ],
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
        defaultValue: 'Tell visitors a bit about who you are.',
        placeholder: 'A short tagline shown under the page title'
      },
      'story.image': {
        label: 'Story Image or Video',
        type: 'media',
        mediaKind: 'any',
        sources: ['manual'],
        defaultValue: ''
      },
      'story.headline': {
        label: 'Story Headline',
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
        defaultValue: 'Come visit us',
        placeholder: 'e.g. Come visit us'
      }
    }
  },

  contact: {
    label: 'Contact',
    path: '/contact',
    verticals: ['restaurant', 'experience', 'professional_service'],
    scope: 'site',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-image', fields: ['hero.title', 'hero.subtitle'] },
    ],
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
    verticals: ['restaurant', 'experience', 'professional_service'],
    scope: 'location',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-image', fields: ['hero.title', 'hero.subtitle', 'hero.image', 'hero.video'] },
      { id: 'content', label: 'Additional Info', icon: 'i-lucide-file-text', fields: ['parking.info', 'extra.notes'] },
    ],
    preview: {
      resolvePath: context => context.locationSlug ? `/locations/${context.locationSlug}` : '/location',
    },
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Location & Hours' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'Find us and see when we’re open.' },
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
    }
  },

  menu: {
    label: 'Menu',
    path: '/menu',
    verticals: ['restaurant'],
    scope: 'location',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-image', fields: ['hero.title', 'hero.subtitle'] }
    ],
    preview: {
      resolvePath: context => context.locationSlug ? `/locations/${context.locationSlug}/menu` : '/menu',
    },
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Our Menu' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'A look at what we serve.' }
    }
  },

  experiences: {
    label: 'Experiences',
    path: '/experiences',
    verticals: ['experience'],
    scope: 'site',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-sparkles', fields: ['hero.kicker', 'hero.title', 'hero.subtitle'] },
    ],
    fields: {
      'hero.kicker': {
        label: 'Hero Kicker',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Experiences',
        placeholder: 'e.g. Experiences'
      },
      'hero.title': {
        label: 'Page Title',
        type: 'text',
        sources: ['manual'],
        defaultValue: 'Experiences',
        placeholder: 'e.g. Classes, dinners, and nights by the oven'
      },
      'hero.subtitle': {
        label: 'Page Subtitle',
        type: 'textarea',
        sources: ['manual'],
        defaultValue: 'Book a hands-on class, tasting night, or special event.',
        placeholder: 'A short line shown under the page title'
      }
    }
  },

  order: {
    label: 'Order Online',
    path: '/order',
    verticals: ['restaurant'],
    scope: 'location',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-shopping-bag', fields: ['hero.title', 'hero.subtitle'] },
    ],
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
    verticals: ['restaurant', 'experience'],
    scope: 'site',
    groups: [
      { id: 'hero', label: 'Hero Section', icon: 'i-lucide-image', fields: ['hero.title', 'hero.subtitle'] },
      { id: 'contact', label: 'Contact Details', icon: 'i-lucide-phone', fields: ['contact.phone', 'contact.email'] },
    ],
    fields: {
      'hero.title': { label: 'Page Title', type: 'text', sources: ['manual'], defaultValue: 'Reservations' },
      'hero.subtitle': { label: 'Page Subtitle', type: 'textarea', sources: ['manual'], defaultValue: 'Plan your visit with us.' },
      'contact.phone': {
        label: 'Contact Phone',
        type: 'text',
        sources: ['manual'],
        defaultValue: ''
      },
      'contact.email': {
        label: 'Contact Email',
        type: 'text',
        sources: ['manual'],
        defaultValue: ''
      }
    }
  }
}

/** Get a field definition for a page+field key */
export const getFieldDef = (page: string, field: string): FieldDefinition | undefined => {
  return contentRegistry[page]?.fields[field]
}
