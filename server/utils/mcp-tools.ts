import type { McpToolRole } from '~/server/utils/mcp-auth'

export interface McpToolDefinition {
  name: string
  description: string
  domain: string
  minimumRole: McpToolRole
  confirmRequired: boolean
  requiredEntitlement?: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  /** Widget name served at ui://widget/{widgetName} — marks this as a render tool */
  widgetName?: string
  widgetInvoking?: string
  widgetInvoked?: string
}

// --- reusable schema fragments ---

const locationObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    city: { type: ['string', 'null'] },
    neighborhood: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    website_url: { type: ['string', 'null'] },
    maps_url: { type: ['string', 'null'] },
    address: { type: ['string', 'null'] },
    opening_hours: { type: ['object', 'null'] },
    rating: { type: ['number', 'null'] },
    review_count: { type: ['number', 'null'] },
    description: { type: ['string', 'null'] },
    short_description: { type: ['string', 'null'] },
    status: { type: 'string' },
    is_primary: { type: 'number' },
    hero_image_asset_id: { type: ['string', 'null'] },
    hero_video_asset_id: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

const menuItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    menu_id: { type: 'string' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    price: { type: ['string', 'null'] },
    section: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    is_available: { type: 'number' },
    image_url: { type: ['string', 'null'] },
    tags: { type: ['string', 'null'] },
  },
}

const menuObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          items: { type: 'array', items: menuItemObject },
        },
      },
    },
  },
}

const postObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: ['string', 'null'] },
    body: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] },
    published_at: { type: ['string', 'null'] },
    channels: { type: ['string', 'null'] },
    thumbnail_asset_id: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

const mediaAssetObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['image', 'video'] },
    provider: { type: 'string' },
    source: { type: 'string' },
    public_url: { type: ['string', 'null'] },
    thumbnail_url: { type: ['string', 'null'] },
    alt_text: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['pending', 'active', 'deleted'] },
    file_name: { type: ['string', 'null'] },
    location_id: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
}

const experienceObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    short_description: { type: ['string', 'null'] },
    duration_minutes: { type: ['number', 'null'] },
    price: { type: ['string', 'null'] },
    currency: { type: ['string', 'null'] },
    capacity: { type: ['number', 'null'] },
    status: { type: 'string' },
    location_id: { type: ['string', 'null'] },
    hero_image_asset_id: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

const bookingObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    experience_id: { type: 'string' },
    guest_name: { type: 'string' },
    guest_email: { type: 'string' },
    guest_phone: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled'] },
    booking_date: { type: ['string', 'null'] },
    party_size: { type: 'number' },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
}

const qaItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    question: { type: 'string' },
    answer: { type: ['string', 'null'] },
    sort_order: { type: 'number' },
    location_id: { type: 'string' },
  },
}

const reviewObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    author: { type: 'string' },
    rating: { type: 'number' },
    text: { type: ['string', 'null'] },
    reply: { type: ['string', 'null'] },
    source: { type: 'string' },
    published_at: { type: ['string', 'null'] },
    location_id: { type: 'string' },
  },
}

const submissionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    message: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['new', 'read', 'replied', 'spam'] },
    created_at: { type: 'string' },
    location_id: { type: ['string', 'null'] },
  },
}

const reservationSubmissionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    party_size: { type: ['number', 'null'] },
    requested_date: { type: ['string', 'null'] },
    requested_time: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['new', 'confirmed', 'declined', 'spam'] },
    created_at: { type: 'string' },
    location_id: { type: ['string', 'null'] },
  },
}

const workRequestObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['open', 'in_progress', 'done', 'cancelled'] },
    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

const translationJobObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    source_locale: { type: 'string' },
    target_locale: { type: 'string' },
    scope: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
    total_items: { type: 'number' },
    total_chars: { type: 'number' },
    estimated_credits: { type: 'number' },
    actual_credits: { type: ['number', 'null'] },
    processed_items: { type: 'number' },
    failed_items: { type: 'number' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    started_at: { type: ['string', 'null'] },
    finished_at: { type: ['string', 'null'] },
  },
}

const siteListItem = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', description: 'Brand name or subdomain slug.' },
    subdomain: { type: 'string' },
    publicUrl: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['draft', 'live', 'paused'] },
  },
  required: ['id', 'name', 'subdomain', 'status'],
}

// ---

const siteIdSchema = {
  site_id: { type: 'string', description: 'Site ID.' },
}

function siteTool(definition: Omit<McpToolDefinition, 'inputSchema' | 'outputSchema'> & {
  inputSchema?: Record<string, unknown>
  required?: string[]
  outputSchema?: Record<string, unknown>
}): McpToolDefinition {
  const properties = {
    ...siteIdSchema,
    ...(definition.inputSchema ?? {}),
  }
  const required = ['site_id', ...(definition.required ?? [])]
  return {
    name: definition.name,
    description: definition.description,
    domain: definition.domain,
    minimumRole: definition.minimumRole,
    confirmRequired: definition.confirmRequired,
    requiredEntitlement: definition.requiredEntitlement,
    inputSchema: {
      type: 'object',
      properties,
      required,
      additionalProperties: true,
    },
    outputSchema: definition.outputSchema ?? { type: 'object' },
  }
}

function globalTool(definition: McpToolDefinition): McpToolDefinition {
  return definition
}

export const MCP_TOOLS: McpToolDefinition[] = [
  globalTool({
    name: 'show_welcome',
    description: 'Show the welcome screen. Lists existing sites or a "Create your first site" CTA for new users. Call this at the start of every conversation.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: {
      type: 'object',
      properties: {
        sites: {
          type: 'array',
          description: 'All sites the caller can access. Empty array means no sites yet.',
          items: siteListItem,
        },
      },
      required: ['sites'],
    },
    widgetName: 'welcome-list',
    widgetInvoking: 'Loading your sites…',
    widgetInvoked: 'Sites loaded',
  }),
  globalTool({
    name: 'show_vertical_picker',
    description: 'Show a clickable business-type picker widget. The user taps one option and it is sent back to the model. Call this after the user clicks "Create a new site" but before asking for their Maps URL.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: {
      type: 'object',
      description: 'Renders an interactive widget. The selected vertical is returned as a follow-up user message.',
      properties: {},
    },
    widgetName: 'vertical-picker',
    widgetInvoking: 'Loading business types…',
    widgetInvoked: 'Choose your business type',
  }),
  globalTool({
    name: 'import_from_maps',
    description: 'Import business details from a Google Maps URL or share link. Returns business info and photos. Call this when the user provides a Maps URL during site creation.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        maps_url: { type: 'string', description: 'Google Maps URL or short share link (maps.app.goo.gl or google.com/maps/place/...).' },
        parsed_hint: {
          type: 'object',
          description: 'Optional, non-authoritative hints from LLM URL parsing. Backend always re-extracts independently and logs divergence >1 km.',
          properties: {
            name_hint: { type: 'string' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            feature_id: { type: 'string' },
            internal_id: { type: 'string' },
            expected_country: { type: 'string' },
            expected_region: { type: 'string' },
          },
          additionalProperties: false,
        },
        matching_policy: {
          type: 'object',
          description: 'Controls how strictly the backend validates the Places API result. Defaults to strict coordinate matching.',
          properties: {
            allow_name_only_fallback: { type: 'boolean', description: 'If false (default), reject when no coordinates are available to bias the search.' },
            require_coordinate_match: { type: 'boolean', description: 'If true (default), reject any Places result more than max_distance_km from URL coordinates.' },
            max_distance_km: { type: 'number', description: 'Rejection threshold in km. Default 5.' },
            prefer_backend_extraction: { type: 'boolean', description: 'If true (default), backend URL extraction takes precedence over parsed_hint.' },
          },
          additionalProperties: false,
        },
      },
      required: ['maps_url'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        business: {
          type: 'object',
          description: 'Parsed business details from Google Places.',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            phone: { type: ['string', 'null'] },
            hours: { type: 'array', items: { type: 'string' } },
            rating: { type: ['number', 'null'] },
            reviewCount: { type: ['number', 'null'] },
            placeId: { type: 'string' },
            mapsUrl: { type: 'string' },
          },
          required: ['name', 'address', 'placeId'],
        },
        photos: {
          type: 'array',
          description: 'Photos uploaded to Cloudflare Images. Up to 10.',
          items: {
            type: 'object',
            properties: {
              cfImageId: { type: 'string' },
              publicUrl: { type: 'string' },
            },
            required: ['cfImageId', 'publicUrl'],
          },
        },
        missingPhotos: { type: 'boolean', description: 'True if fewer than 3 photos were imported — prompt the user to upload their own.' },
      },
      required: ['business', 'photos', 'missingPhotos'],
    },
    widgetName: 'photo-album',
    widgetInvoking: 'Importing from Google Maps…',
    widgetInvoked: 'Business imported',
  }),
  globalTool({
    name: 'show_generated_images',
    description: 'Show a carousel of AI-generated hero images for the user to pick from. Call save_generated_image first to persist each image, then pass the resulting assetId and publicUrl here.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          description: 'Array of { assetId, publicUrl } returned by save_generated_image.',
          items: { type: 'object', properties: { assetId: { type: 'string' }, publicUrl: { type: 'string' } } },
        },
      },
      required: ['images'],
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      description: 'Renders an image carousel widget. The user selects one image and the assetId is returned.',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assetId: { type: 'string' },
              publicUrl: { type: 'string' },
            },
            required: ['assetId', 'publicUrl'],
          },
        },
      },
      required: ['images'],
    },
    widgetName: 'image-carousel',
    widgetInvoking: 'Loading generated images…',
    widgetInvoked: 'Pick your hero image',
  }),
  siteTool({
    name: 'save_generated_image',
    description: 'Upload a ChatGPT natively-generated image (base64 from image_generation_call.result) to Cloudflare Images and persist a media_asset record. Returns assetId and publicUrl to pass to show_generated_images.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      image_data: { type: 'string', description: 'Base64-encoded image data from image_generation_call.result.' },
      prompt: { type: 'string', description: 'The prompt used to generate the image (stored as alt text).' },
    },
    required: ['image_data'],
    outputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        publicUrl: { type: 'string' },
        thumbnailUrl: { type: 'string' },
      },
      required: ['assetId', 'publicUrl'],
    },
  }),
  globalTool({
    name: 'list_sites',
    description: 'List the caller\'s accessible sites.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: {
      type: 'object',
      properties: {
        sites: {
          type: 'array',
          items: siteListItem,
        },
      },
      required: ['sites'],
    },
    widgetName: 'welcome-list',
    widgetInvoking: 'Loading your sites…',
    widgetInvoked: 'Sites loaded',
  }),
  globalTool({
    name: 'create_site',
    description: 'Create a new site in the caller\'s organization.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        subdomain: { type: 'string' },
        vertical: { type: 'string', enum: ['restaurant', 'experience'] },
      },
      required: ['name', 'subdomain', 'vertical'],
      additionalProperties: true,
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'New site ID — pass as site_id in all subsequent calls.' },
        siteId: { type: 'string', description: 'New site ID — pass as site_id in all subsequent calls.' },
        subdomain: { type: 'string' },
        organizationId: { type: 'string' },
        status: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['id', 'siteId', 'subdomain'],
    },
  }),
  siteTool({
    name: 'show_site_preview',
    description: 'Show a live iframe preview of the newly created site. Call after create_site + create_location succeed.',
    domain: 'onboarding',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        site: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            subdomain: { type: 'string' },
            publicUrl: { type: 'string' },
          },
          required: ['id', 'subdomain', 'publicUrl'],
        },
        pages: {
          type: 'array',
          description: 'Navigable pages shown in the preview tabs.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              path: { type: 'string' },
            },
            required: ['label', 'path'],
          },
        },
        ogImageUrl: { type: ['string', 'null'], description: 'Hero image URL for the OG preview.' },
      },
      required: ['site', 'pages'],
    },
    widgetName: 'site-preview',
    widgetInvoking: 'Building your site preview…',
    widgetInvoked: 'Your site is live!',
  }),
  siteTool({
    name: 'get_site',
    description: 'Get site details.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        site: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organization_id: { type: 'string' },
            subdomain: { type: 'string' },
            theme: { type: 'string' },
            status: { type: 'string' },
            brand_name: { type: ['string', 'null'] },
            brand_description: { type: ['string', 'null'] },
            logo_url: { type: ['string', 'null'] },
            public_url: { type: ['string', 'null'] },
            last_published_at: { type: ['string', 'null'] },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
          required: ['id', 'subdomain', 'status'],
        },
      },
      required: ['site'],
    },
  }),
  siteTool({
    name: 'get_site_settings',
    description: 'Get editable site settings.',
    domain: 'sites',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        settings: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            subdomain: { type: 'string' },
            theme: { type: 'string' },
            status: { type: 'string' },
            brand_name: { type: ['string', 'null'] },
            brand_description: { type: ['string', 'null'] },
            logo_url: { type: ['string', 'null'] },
            logo_asset_id: { type: ['string', 'null'] },
            contact_email: { type: ['string', 'null'] },
            default_currency: { type: ['string', 'null'] },
            url_structure: { type: 'string' },
          },
          required: ['id', 'subdomain'],
        },
      },
      required: ['settings'],
    },
  }),
  siteTool({
    name: 'update_site_settings',
    description: 'Update editable site settings.',
    domain: 'sites',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      brand_name: { type: 'string' },
      brand_description: { type: 'string' },
      logo_url: { type: 'string' },
      logo_asset_id: { type: 'string' },
      contact_email: { type: 'string' },
      default_currency: { type: 'string' },
      brand_color: { type: 'string' },
      social_facebook: { type: 'string' },
      social_instagram: { type: 'string' },
      social_tiktok: { type: 'string' },
      footer_tagline: { type: 'string' },
      press_email: { type: 'string' },
      partnerships_email: { type: 'string' },
      catering_email: { type: 'string' },
      careers_email: { type: 'string' },
      google_analytics_measurement_id: { type: 'string' },
      google_site_verification: { type: 'string' },
      url_structure: { type: 'string' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        updated: { type: 'boolean' },
      },
      required: ['id'],
    },
  }),
  siteTool({
    name: 'list_locations',
    description: 'List site locations.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        locations: { type: 'array', items: locationObject },
      },
      required: ['locations'],
    },
  }),
  siteTool({
    name: 'get_location',
    description: 'Get one location.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { location: locationObject },
      required: ['location'],
    },
  }),
  siteTool({
    name: 'create_location',
    description: 'Create a location.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { title: { type: 'string' } },
    required: ['title'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        title: { type: 'string' },
        site_id: { type: 'string' },
        organization_id: { type: 'string' },
      },
      required: ['id', 'slug', 'title'],
    },
  }),
  siteTool({
    name: 'update_location',
    description: 'Update a location.',
    domain: 'locations',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        updated: { type: 'boolean' },
      },
      required: ['id'],
    },
  }),
  siteTool({
    name: 'delete_location',
    description: 'Delete a location.',
    domain: 'locations',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'list_menus',
    description: 'List menus.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        menus: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
              location_id: { type: ['string', 'null'] },
              sort_order: { type: 'number' },
            },
            required: ['id', 'name'],
          },
        },
      },
      required: ['menus'],
    },
  }),
  siteTool({
    name: 'get_menu',
    description: 'Get a menu with items.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' } },
    required: ['menu_id'],
    outputSchema: {
      type: 'object',
      properties: { menu: menuObject },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'create_menu',
    description: 'Create a menu.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { name: { type: 'string' }, location_id: { type: 'string' }, description: { type: 'string' } },
    required: ['name'],
    outputSchema: {
      type: 'object',
      properties: {
        menu: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            location_id: { type: ['string', 'null'] },
          },
          required: ['id', 'name'],
        },
      },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'update_menu',
    description: 'Update a menu.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' } },
    required: ['menu_id'],
    outputSchema: {
      type: 'object',
      properties: {
        menu: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id'],
        },
      },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'delete_menu',
    description: 'Delete a menu.',
    domain: 'menus',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { menu_id: { type: 'string' } },
    required: ['menu_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'create_menu_item',
    description: 'Create a menu item.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' }, name: { type: 'string' } },
    required: ['menu_id', 'name'],
    outputSchema: {
      type: 'object',
      properties: { item: menuItemObject },
      required: ['item'],
    },
  }),
  siteTool({
    name: 'update_menu_item',
    description: 'Update a menu item.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_item_id: { type: 'string' } },
    required: ['menu_item_id'],
    outputSchema: {
      type: 'object',
      properties: { item: menuItemObject },
      required: ['item'],
    },
  }),
  siteTool({
    name: 'delete_menu_item',
    description: 'Delete a menu item.',
    domain: 'menus',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { menu_item_id: { type: 'string' } },
    required: ['menu_item_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'rename_menu_section',
    description: 'Rename a menu section.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' }, old_name: { type: 'string' }, new_name: { type: 'string' } },
    required: ['menu_id', 'old_name', 'new_name'],
    outputSchema: {
      type: 'object',
      properties: {
        updated: { type: 'number', description: 'Number of items renamed.' },
      },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'delete_menu_section',
    description: 'Delete a menu section.',
    domain: 'menus',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { menu_id: { type: 'string' }, section_name: { type: 'string' } },
    required: ['menu_id', 'section_name'],
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'number', description: 'Number of items deleted.' },
      },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'reorder_menu_items',
    description: 'Reorder menu items.',
    domain: 'menus',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { menu_id: { type: 'string' }, updates: { type: 'array' } },
    required: ['menu_id', 'updates'],
    outputSchema: {
      type: 'object',
      properties: { updated: { type: 'boolean' } },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'list_posts',
    description: 'List posts.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { status: { type: 'string' } },
    outputSchema: {
      type: 'object',
      properties: { posts: { type: 'array', items: postObject } },
      required: ['posts'],
    },
  }),
  siteTool({
    name: 'get_post',
    description: 'Get a post.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'create_post',
    description: 'Create a draft post.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { body: { type: 'string' } },
    required: ['body'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'update_post',
    description: 'Update a post.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'publish_post',
    description: 'Publish a post.',
    domain: 'posts',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { post_id: { type: 'string' }, channels: { type: 'array' } },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { post: postObject },
      required: ['post'],
    },
  }),
  siteTool({
    name: 'delete_post',
    description: 'Delete a post.',
    domain: 'posts',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { post_id: { type: 'string' } },
    required: ['post_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'list_media_assets',
    description: 'List media assets.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { kind: { type: 'string' }, location_id: { type: 'string' } },
    outputSchema: {
      type: 'object',
      properties: { assets: { type: 'array', items: mediaAssetObject } },
      required: ['assets'],
    },
  }),
  siteTool({
    name: 'request_media_upload',
    description: 'Create a pending image upload request.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { filename: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' } },
    outputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: 'Pass to confirm_media_upload after the browser finishes uploading.' },
        upload_url: { type: 'string', description: 'Cloudflare direct-upload URL — POST the image file here from the browser.' },
        image_id: { type: 'string', description: 'Cloudflare Images ID.' },
      },
      required: ['asset_id', 'upload_url', 'image_id'],
    },
  }),
  siteTool({
    name: 'confirm_media_upload',
    description: 'Confirm a pending uploaded image.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { asset_id: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string' },
        public_url: { type: 'string' },
        thumbnail_url: { type: 'string' },
        status: { type: 'string', enum: ['active'] },
      },
      required: ['asset_id', 'public_url', 'status'],
    },
  }),
  siteTool({
    name: 'update_media_asset',
    description: 'Update media metadata.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { asset_id: { type: 'string' }, alt_text: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: { updated: mediaAssetObject },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'delete_media_asset',
    description: 'Delete a media asset.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { asset_id: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'import_menu_from_media',
    description: 'Extract a draft menu from a menu photo or PDF.',
    domain: 'media',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { asset_id: { type: 'string' }, menu_name: { type: 'string' } },
    required: ['asset_id'],
    outputSchema: {
      type: 'object',
      properties: {
        menu: {
          type: 'object',
          description: 'Created draft menu.',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
        items_created: { type: 'number', description: 'Number of menu items extracted and created.' },
      },
      required: ['menu'],
    },
  }),
  siteTool({
    name: 'get_page_content',
    description: 'Get merged published plus draft content for one page.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { page: { type: 'string' }, location_id: { type: 'string' } },
    required: ['page'],
    outputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string' },
        content: { type: 'object', description: 'Published content key-value pairs.' },
        draft: { type: 'object', description: 'Unsaved draft overrides.' },
        hasDraft: { type: 'boolean' },
      },
      required: ['page'],
    },
  }),
  siteTool({
    name: 'save_content_draft',
    description: 'Save draft content changes.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { page: { type: 'string' }, changes: { type: 'object' }, location_id: { type: 'string' } },
    required: ['page', 'changes'],
    outputSchema: {
      type: 'object',
      properties: {
        saved: { type: 'boolean' },
        page: { type: 'string' },
        fields_updated: { type: 'number' },
      },
      required: ['saved'],
    },
  }),
  siteTool({
    name: 'get_content_draft_status',
    description: 'Get content draft status.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { page: { type: 'string' }, location_id: { type: 'string' } },
    outputSchema: {
      type: 'object',
      properties: {
        hasDraft: { type: 'boolean' },
        count: { type: 'number', description: 'Number of draft fields pending publish.' },
        pages: { type: 'array', items: { type: 'string' }, description: 'Pages that have unpublished drafts.' },
      },
      required: ['hasDraft'],
    },
  }),
  siteTool({
    name: 'publish_content_drafts',
    description: 'Publish content drafts.',
    domain: 'content',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: { page: { type: 'string' }, location_id: { type: 'string' }, all: { type: 'boolean' } },
    outputSchema: {
      type: 'object',
      properties: {
        published: { type: 'number', description: 'Number of draft fields published.' },
      },
      required: ['published'],
    },
  }),
  siteTool({
    name: 'discard_content_drafts',
    description: 'Discard content drafts.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { page: { type: 'string' }, location_id: { type: 'string' }, all: { type: 'boolean' } },
    outputSchema: {
      type: 'object',
      properties: {
        discarded: { type: 'number', description: 'Number of draft fields discarded.' },
      },
      required: ['discarded'],
    },
  }),
  siteTool({
    name: 'delete_content_field',
    description: 'Delete a content field from live and draft content.',
    domain: 'content',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { page: { type: 'string' }, field: { type: 'string' }, location_id: { type: 'string' } },
    required: ['page', 'field'],
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean' },
        field: { type: 'string' },
      },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'list_location_qa',
    description: 'List Q&A for a location.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { items: { type: 'array', items: qaItemObject } },
      required: ['items'],
    },
  }),
  siteTool({
    name: 'create_location_qa',
    description: 'Create a Q&A pair for a location.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' }, question: { type: 'string' } },
    required: ['location_id', 'question'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        answer: { type: ['string', 'null'] },
        sort_order: { type: 'number' },
        location_id: { type: 'string' },
      },
      required: ['id', 'question'],
    },
  }),
  siteTool({
    name: 'update_location_qa',
    description: 'Update a Q&A entry.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' }, qa_id: { type: 'string' } },
    required: ['location_id', 'qa_id'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        answer: { type: ['string', 'null'] },
      },
      required: ['id'],
    },
  }),
  siteTool({
    name: 'delete_location_qa',
    description: 'Delete a Q&A entry.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { location_id: { type: 'string' }, qa_id: { type: 'string' } },
    required: ['location_id', 'qa_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'reorder_location_qa',
    description: 'Swap two Q&A sort orders.',
    domain: 'qa',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' }, updates: { type: 'array' } },
    required: ['location_id', 'updates'],
    outputSchema: {
      type: 'object',
      properties: { updated: { type: 'number' } },
      required: ['updated'],
    },
  }),
  siteTool({
    name: 'list_location_reviews',
    description: 'List reviews for a location.',
    domain: 'reviews',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: { reviews: { type: 'array', items: reviewObject } },
      required: ['reviews'],
    },
  }),
  siteTool({
    name: 'reply_to_review',
    description: 'Add or update the owner reply for a review.',
    domain: 'reviews',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { review_id: { type: 'string' }, reply: { type: 'string' } },
    required: ['review_id', 'reply'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        reply: { type: 'string' },
        updated_at: { type: 'string' },
      },
      required: ['id', 'reply'],
    },
  }),
  siteTool({
    name: 'list_experiences',
    description: 'List experiences.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { location_id: { type: 'string' } },
    outputSchema: {
      type: 'object',
      properties: { experiences: { type: 'array', items: experienceObject } },
      required: ['experiences'],
    },
  }),
  siteTool({
    name: 'get_experience',
    description: 'Get an experience.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string' } },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'create_experience',
    description: 'Create an experience.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { title: { type: 'string' } },
    required: ['title'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'update_experience',
    description: 'Update an experience.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string' } },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { experience: experienceObject },
      required: ['experience'],
    },
  }),
  siteTool({
    name: 'delete_experience',
    description: 'Delete an experience.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { experience_id: { type: 'string' } },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'list_experience_bookings',
    description: 'List experience bookings.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string' } },
    required: ['experience_id'],
    outputSchema: {
      type: 'object',
      properties: { bookings: { type: 'array', items: bookingObject } },
      required: ['bookings'],
    },
  }),
  siteTool({
    name: 'update_experience_booking',
    description: 'Update a booking status.',
    domain: 'experiences',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { experience_id: { type: 'string' }, booking_id: { type: 'string' }, status: { type: 'string' } },
    required: ['experience_id', 'booking_id', 'status'],
    outputSchema: {
      type: 'object',
      properties: { booking: bookingObject },
      required: ['booking'],
    },
  }),
  siteTool({
    name: 'list_locales',
    description: 'List enabled locales.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        locales: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              locale: { type: 'string', description: 'BCP-47 locale code, e.g. "th", "zh".' },
              is_enabled: { type: 'number' },
              created_at: { type: 'string' },
            },
            required: ['locale'],
          },
        },
      },
      required: ['locales'],
    },
  }),
  siteTool({
    name: 'upsert_locale',
    description: 'Create or update a locale.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { locale: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        locale: {
          type: 'object',
          properties: {
            locale: { type: 'string' },
            is_enabled: { type: 'number' },
          },
          required: ['locale'],
        },
      },
      required: ['locale'],
    },
  }),
  siteTool({
    name: 'delete_locale',
    description: 'Delete a locale.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: { locale: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean' },
        locale: { type: 'string' },
      },
      required: ['deleted'],
    },
  }),
  siteTool({
    name: 'get_translation_inventory',
    description: 'Estimate translation scope and cost.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        targetLocale: { type: 'string' },
        scope: { type: 'string' },
        totalItems: { type: 'number' },
        totalChars: { type: 'number' },
        estimatedInputTokens: { type: 'number' },
        estimatedOutputTokens: { type: 'number' },
        estimatedCredits: { type: 'number' },
        breakdown: { type: 'object', description: 'Item counts by content type.' },
      },
      required: ['targetLocale', 'totalItems', 'totalChars', 'estimatedCredits'],
    },
  }),
  siteTool({
    name: 'start_translation_job',
    description: 'Create a translation job and run the first batch.',
    domain: 'translations',
    minimumRole: 'admin',
    confirmRequired: true,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' }, includePublished: { type: 'boolean' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        job: translationJobObject,
        first_batch: {
          type: 'object',
          description: 'Result of the first processing batch.',
          properties: {
            processed: { type: 'number' },
            failed: { type: 'number' },
            remaining: { type: 'number' },
          },
        },
      },
      required: ['job', 'first_batch'],
    },
  }),
  siteTool({
    name: 'list_translation_jobs',
    description: 'List translation jobs.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    outputSchema: {
      type: 'object',
      properties: { jobs: { type: 'array', items: translationJobObject } },
      required: ['jobs'],
    },
  }),
  siteTool({
    name: 'get_translation_job',
    description: 'Get a translation job and its items.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { job_id: { type: 'string' } },
    required: ['job_id'],
    outputSchema: {
      type: 'object',
      properties: {
        job: translationJobObject,
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              entity_type: { type: 'string' },
              entity_id: { type: 'string' },
              field: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'translated', 'failed', 'skipped'] },
              error: { type: ['string', 'null'] },
            },
            required: ['id', 'entity_type', 'field', 'status'],
          },
        },
      },
      required: ['job', 'items'],
    },
  }),
  siteTool({
    name: 'run_translation_job_batch',
    description: 'Run another translation job batch.',
    domain: 'translations',
    minimumRole: 'admin',
    confirmRequired: true,
    requiredEntitlement: 'translation',
    inputSchema: { job_id: { type: 'string' } },
    required: ['job_id'],
    outputSchema: {
      type: 'object',
      properties: {
        processed: { type: 'number' },
        failed: { type: 'number' },
        remaining: { type: 'number' },
        status: { type: 'string', enum: ['running', 'completed', 'failed'] },
      },
      required: ['processed'],
    },
  }),
  siteTool({
    name: 'get_translation_review_items',
    description: 'List translation review items.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' }, status: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              entity_type: { type: 'string' },
              entity_id: { type: 'string' },
              field: { type: 'string' },
              source_text: { type: 'string' },
              translated_text: { type: ['string', 'null'] },
              status: { type: 'string' },
            },
            required: ['id', 'entity_type', 'field'],
          },
        },
        total: { type: 'number' },
      },
      required: ['items'],
    },
  }),
  siteTool({
    name: 'save_translation_review_item',
    description: 'Save manual translation review edits.',
    domain: 'translations',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, entity_type: { type: 'string' }, entity_id: { type: 'string' }, field: { type: 'string' }, fields: { type: 'object' }, scope: { type: 'string' } },
    required: ['locale', 'entity_type', 'entity_id', 'field', 'fields'],
    outputSchema: {
      type: 'object',
      properties: {
        saved: { type: 'boolean' },
        entity_id: { type: 'string' },
        field: { type: 'string' },
      },
      required: ['saved'],
    },
  }),
  siteTool({
    name: 'publish_translations',
    description: 'Publish draft translations.',
    domain: 'translations',
    minimumRole: 'admin',
    confirmRequired: true,
    requiredEntitlement: 'translation',
    inputSchema: { locale: { type: 'string' }, scope: { type: 'string' } },
    required: ['locale'],
    outputSchema: {
      type: 'object',
      properties: {
        published: { type: 'number', description: 'Number of translation fields published.' },
        locale: { type: 'string' },
      },
      required: ['published'],
    },
  }),
  siteTool({
    name: 'list_contact_submissions',
    description: 'List contact submissions.',
    domain: 'submissions',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: { submissions: { type: 'array', items: submissionObject } },
      required: ['submissions'],
    },
  }),
  siteTool({
    name: 'update_contact_submission',
    description: 'Update contact submission triage status.',
    domain: 'submissions',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { submission_id: { type: 'string' }, status: { type: 'string' } },
    required: ['submission_id', 'status'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        updated_at: { type: 'string' },
      },
      required: ['id', 'status'],
    },
  }),
  siteTool({
    name: 'list_reservation_submissions',
    description: 'List reservation submissions.',
    domain: 'submissions',
    minimumRole: 'editor',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: { submissions: { type: 'array', items: reservationSubmissionObject } },
      required: ['submissions'],
    },
  }),
  siteTool({
    name: 'update_reservation_submission',
    description: 'Update reservation submission triage status.',
    domain: 'submissions',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { submission_id: { type: 'string' }, status: { type: 'string' } },
    required: ['submission_id', 'status'],
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        updated_at: { type: 'string' },
      },
      required: ['id', 'status'],
    },
  }),
  siteTool({
    name: 'get_notification_settings',
    description: 'Get notification settings.',
    domain: 'notifications',
    minimumRole: 'admin',
    confirmRequired: false,
    outputSchema: {
      type: 'object',
      properties: {
        notifications: {
          type: 'object',
          properties: {
            whatsapp_phone: { type: ['string', 'null'] },
            notify_on_contact: { type: 'number' },
            notify_on_reservation: { type: 'number' },
            notify_on_booking: { type: 'number' },
          },
        },
      },
      required: ['notifications'],
    },
  }),
  siteTool({
    name: 'update_notification_settings',
    description: 'Update notification settings.',
    domain: 'notifications',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { whatsapp_phone: { type: 'string' } },
    required: ['whatsapp_phone'],
    outputSchema: {
      type: 'object',
      properties: {
        notifications: {
          type: 'object',
          properties: { whatsapp_phone: { type: 'string' } },
          required: ['whatsapp_phone'],
        },
      },
      required: ['notifications'],
    },
  }),
  siteTool({
    name: 'get_google_business_connection',
    description: 'Get a location Google Business connection.',
    domain: 'google_business',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'google_business',
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: {
        connection: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            account_id: { type: ['string', 'null'] },
            gmb_location_id: { type: ['string', 'null'] },
            location_name: { type: ['string', 'null'] },
            last_synced_at: { type: ['string', 'null'] },
          },
          required: ['connected'],
        },
      },
      required: ['connection'],
    },
  }),
  siteTool({
    name: 'get_google_business_auth_url',
    description: 'Start Google Business auth for a location.',
    domain: 'google_business',
    minimumRole: 'owner',
    confirmRequired: false,
    requiredEntitlement: 'google_business',
    inputSchema: { location_id: { type: 'string' } },
    required: ['location_id'],
    outputSchema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string', description: 'Google OAuth URL — direct the user to open this in a browser.' },
      },
      required: ['authUrl'],
    },
  }),
  siteTool({
    name: 'list_google_business_accounts',
    description: 'List connected Google Business accounts and locations.',
    domain: 'google_business',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'google_business',
    outputSchema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              locations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    address: { type: 'string' },
                  },
                  required: ['id', 'name'],
                },
              },
            },
            required: ['id', 'name'],
          },
        },
      },
      required: ['accounts'],
    },
  }),
  siteTool({
    name: 'sync_google_business_locations',
    description: 'Sync selected Google Business locations into the site.',
    domain: 'google_business',
    minimumRole: 'owner',
    confirmRequired: true,
    requiredEntitlement: 'google_business',
    inputSchema: { account_id: { type: 'string' }, location_ids: { type: 'array' } },
    required: ['account_id', 'location_ids'],
    outputSchema: {
      type: 'object',
      properties: {
        synced: { type: 'number', description: 'Number of locations synced.' },
        locations: { type: 'array', items: locationObject },
      },
      required: ['synced'],
    },
  }),
  siteTool({
    name: 'list_work_requests',
    description: 'List managed-service work requests.',
    domain: 'managed_service',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'managed_service',
    outputSchema: {
      type: 'object',
      properties: { requests: { type: 'array', items: workRequestObject } },
      required: ['requests'],
    },
  }),
  siteTool({
    name: 'create_work_request',
    description: 'Create a managed-service work request.',
    domain: 'managed_service',
    minimumRole: 'editor',
    confirmRequired: false,
    requiredEntitlement: 'managed_service',
    inputSchema: { type: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string' } },
    required: ['type', 'title'],
    outputSchema: {
      type: 'object',
      properties: workRequestObject.properties,
      required: ['id', 'type', 'title', 'status'],
    },
  }),
].sort((a, b) => a.name.localeCompare(b.name))

export function getMcpTool(name: string) {
  return MCP_TOOLS.find((tool) => tool.name === name) ?? null
}
