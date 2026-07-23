import { getBlogPostPath } from '~/utils/blog-categories'
import { categoryToSlug } from '~/utils/docs-categories'

export type PlatformKnowledgeResultType =
  | 'doc'
  | 'blog'
  | 'faq'
  | 'route'
  | 'platform_page'
  | 'dashboard_route'

export type PlatformKnowledgeSurface =
  | 'public'
  | 'docs'
  | 'blog'
  | 'dashboard'
  | 'help'
  | 'chowbot'
  | 'tenant_blog'

export interface PlatformKnowledgeFaqEntry {
  id: string
  title: string
  answer: string
  keywords: string[]
}

export interface PlatformKnowledgeRouteEntry {
  id: string
  title: string
  path: string
  snippet: string
  icon: string
  section: string
  keywords: string[]
  surfaces: PlatformKnowledgeSurface[]
}

export interface PlatformKnowledgePageEntry {
  id: string
  title: string
  path: string
  snippet: string
  body: string
  icon: string
  section: string
  keywords: string[]
  surfaces: PlatformKnowledgeSurface[]
}

export interface DashboardRouteContext {
  orgSlug?: string | null
  siteSlug?: string | null
  locationSlug?: string | null
}

export interface PlatformDashboardRouteEntry {
  id: string
  title: string
  pathTemplate: string
  fallbackPath: string
  snippet: string
  body: string
  icon: string
  section: string
  keywords: string[]
  surfaces: PlatformKnowledgeSurface[]
}

export const PLATFORM_KNOWLEDGE_FAQ_ENTRIES: PlatformKnowledgeFaqEntry[] = [
  {
    id: 'getting-started-no-tech-skills',
    title: 'Do I need technical skills to use KrabiClaw?',
    answer: 'No. KrabiClaw is designed for business owners, not developers. You can launch and update your site through guided flows and conversation.',
    keywords: ['technical skills', 'developer', 'beginner', 'easy', 'setup'],
  },
  {
    id: 'create-first-website',
    title: 'How do I create my first website?',
    answer: 'Create an account, choose your site name and subdomain, and then use the dashboard or ChowBot to add locations, offerings, photos, and content.',
    keywords: ['first website', 'create site', 'signup', 'subdomain', 'launch'],
  },
  {
    id: 'google-business-optional',
    title: 'Can I use KrabiClaw without Google Business?',
    answer: 'Yes. Google Business is optional. You can add your hours, offerings, photos, and content manually and connect Google later.',
    keywords: ['google business', 'optional', 'manual setup', 'without google'],
  },
  {
    id: 'menu-updates',
    title: 'How do I add or update menu items?',
    answer: 'Use the dashboard Offerings area or ask ChowBot to add items, adjust prices, rewrite descriptions, or import from a menu photo.',
    keywords: ['menu', 'offerings', 'menu items', 'prices', 'import menu'],
  },
  {
    id: 'hours-updates',
    title: 'How do I update opening hours?',
    answer: 'Go to the dashboard location settings to edit hours manually, or connect Google Business if you want hours to stay in sync.',
    keywords: ['hours', 'opening hours', 'business hours', 'location settings'],
  },
  {
    id: 'custom-domain',
    title: 'How do I connect my own domain?',
    answer: 'Upgrade to a plan that includes custom domains, open the site Domains page, and then add the DNS records KrabiClaw provides.',
    keywords: ['custom domain', 'dns', 'domain setup', 'connect domain'],
  },
  {
    id: 'ssl',
    title: 'Is SSL included?',
    answer: 'Yes. KrabiClaw sites are served over HTTPS with managed SSL.',
    keywords: ['ssl', 'https', 'security certificate'],
  },
  {
    id: 'google-reviews',
    title: 'Will my Google reviews show on my site?',
    answer: 'Yes. When Google Business is connected, reviews can appear on your site automatically.',
    keywords: ['google reviews', 'reviews', 'sync reviews'],
  },
  {
    id: 'plans-change',
    title: 'Can I change plans anytime?',
    answer: 'Yes. You can upgrade or downgrade from the dashboard billing area, and each site keeps its own plan.',
    keywords: ['plans', 'upgrade', 'downgrade', 'billing'],
  },
  {
    id: 'ai-credits',
    title: 'What are AI credits?',
    answer: 'AI credits power features like content generation, image generation, and menu/photo-assisted editing flows.',
    keywords: ['ai credits', 'credits', 'usage', 'generation'],
  },
]

export const PLATFORM_KNOWLEDGE_ROUTE_ENTRIES: PlatformKnowledgeRouteEntry[] = [
  {
    id: 'docs',
    title: 'Documentation',
    path: '/docs',
    snippet: 'Guides for setup, content editing, integrations, billing, analytics, and launch workflows.',
    icon: 'book',
    section: 'Docs',
    keywords: ['docs', 'documentation', 'guide', 'setup', 'help'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'blog',
    title: 'Blog',
    path: '/blog',
    snippet: 'Product updates, strategic articles, launch notes, and deeper platform guidance.',
    icon: 'newspaper',
    section: 'Blog',
    keywords: ['blog', 'articles', 'updates', 'announcements', 'seo'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'help',
    title: 'Support',
    path: '/help',
    snippet: 'Talk to ChowBot support, browse docs, and send a support case if you are blocked.',
    icon: 'circle-help',
    section: 'Support',
    keywords: ['support', 'help', 'contact support', 'agent', 'chowbot'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'pricing',
    title: 'Pricing',
    path: '/pricing',
    snippet: 'Plan comparison, billing details, AI credits, and what each paid tier unlocks.',
    icon: 'credit-card',
    section: 'Platform',
    keywords: ['pricing', 'plans', 'billing', 'cost', 'subscription'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'login',
    title: 'Login',
    path: '/login',
    snippet: 'Sign in to access the dashboard, ChowBot, billing, and site settings.',
    icon: 'log-in',
    section: 'Platform',
    keywords: ['login', 'sign in', 'account', 'dashboard access'],
    surfaces: ['public', 'help', 'chowbot'],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    path: '/dashboard',
    snippet: 'Manage sites, billing, members, analytics, settings, and support workflows.',
    icon: 'layout-dashboard',
    section: 'Dashboard',
    keywords: ['dashboard', 'workspace', 'manage site', 'admin'],
    surfaces: ['dashboard', 'help', 'chowbot'],
  },
]

export const PLATFORM_KNOWLEDGE_PAGE_ENTRIES: PlatformKnowledgePageEntry[] = [
  {
    id: 'home',
    title: 'KrabiClaw Home',
    path: '/',
    snippet: 'Overview of the AI website platform for restaurants, experiences, and local businesses.',
    body: 'KrabiClaw helps local businesses launch fast websites, manage content through ChowBot and the dashboard, and convert organic traffic directly on their own site.',
    icon: 'sparkles',
    section: 'Platform',
    keywords: ['home', 'overview', 'krabiclaw', 'platform', 'what is krabiclaw'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'pricing-page',
    title: 'Pricing Plans',
    path: '/pricing',
    snippet: 'Compare tiers, billing, AI credits, and what each plan unlocks.',
    body: 'Pricing explains the differences between free and paid plans, billing expectations, managed support, and which features are available at each tier.',
    icon: 'credit-card',
    section: 'Platform',
    keywords: ['pricing', 'plan', 'billing', 'upgrade', 'credits'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'features-page',
    title: 'Platform Features',
    path: '/features',
    snippet: 'Learn how KrabiClaw handles content, analytics, SEO, speed, and AI-assisted workflows.',
    body: 'Features cover AI editing, Google Business integrations, analytics, performance, site management, and tools for local businesses to own their direct traffic.',
    icon: 'star',
    section: 'Platform',
    keywords: ['features', 'seo', 'analytics', 'performance', 'google business'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'templates-page',
    title: 'Templates',
    path: '/templates',
    snippet: 'Explore available presentation styles and platform templates for new sites.',
    body: 'Templates show the design system options and layout directions available when launching a KrabiClaw site.',
    icon: 'layout-template',
    section: 'Platform',
    keywords: ['templates', 'themes', 'design', 'saya', 'blawby', 'layouts'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'templates-saya-page',
    title: 'Saya Template',
    path: '/templates/saya',
    snippet: 'Editorial restaurant and experience websites with deep Google Business integration.',
    body: 'The Saya template is the flagship KrabiClaw theme for restaurants and experiences — editorial typography, location-centric navigation, and Google Business data sync. Free on all plans.',
    icon: 'layout-template',
    section: 'Platform',
    keywords: ['saya', 'template', 'theme', 'restaurant', 'experience', 'free'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
  {
    id: 'templates-blawby-page',
    title: 'Blawby Template',
    path: '/templates/blawby',
    snippet: 'Professional-service sites with service pages, article publishing, and consultation CTAs.',
    body: 'The Blawby template is built for professional-service businesses — service/practice-area pages, article publishing, compliance/policy content, and consultation-focused CTAs. Live on North Carolina Legal Services.',
    icon: 'layout-template',
    section: 'Platform',
    keywords: ['blawby', 'template', 'theme', 'professional service', 'legal', 'law firm', 'ncls'],
    surfaces: ['public', 'docs', 'blog', 'help', 'chowbot'],
  },
]

export const PLATFORM_DASHBOARD_ROUTE_ENTRIES: PlatformDashboardRouteEntry[] = [
  {
    id: 'dashboard-overview',
    title: 'Dashboard Overview',
    pathTemplate: '/dashboard',
    fallbackPath: '/dashboard',
    snippet: 'Open the main dashboard overview and choose your workspace.',
    body: 'Use the main dashboard overview to access organizations, sites, setup flows, and your top-level navigation.',
    icon: 'layout-dashboard',
    section: 'Dashboard',
    keywords: ['dashboard', 'overview', 'home', 'workspace'],
    surfaces: ['dashboard'],
  },
  {
    id: 'org-settings-general',
    title: 'Organization Settings',
    pathTemplate: '/dashboard/:orgSlug/settings/general',
    fallbackPath: '/dashboard',
    snippet: 'Edit organization name, defaults, and core settings.',
    body: 'Organization settings include general details, billing, ChatGPT configuration, members, and analytics.',
    icon: 'settings',
    section: 'Settings',
    keywords: ['settings', 'organization', 'general', 'defaults'],
    surfaces: ['dashboard'],
  },
  {
    id: 'org-settings-billing',
    title: 'Billing Settings',
    pathTemplate: '/dashboard/:orgSlug/settings/billing',
    fallbackPath: '/dashboard',
    snippet: 'Manage billing, plans, and payment status.',
    body: 'Billing settings show plan details, billing actions, and payment management for the current organization.',
    icon: 'credit-card',
    section: 'Settings',
    keywords: ['billing', 'plans', 'payments', 'subscription'],
    surfaces: ['dashboard'],
  },
  {
    id: 'org-settings-members',
    title: 'Member Settings',
    pathTemplate: '/dashboard/:orgSlug/settings/members',
    fallbackPath: '/dashboard',
    snippet: 'Invite teammates and manage organization members.',
    body: 'Member settings handles access control, team members, and role management.',
    icon: 'users',
    section: 'Settings',
    keywords: ['members', 'team', 'invite', 'roles'],
    surfaces: ['dashboard'],
  },
  {
    id: 'org-settings-analytics',
    title: 'Analytics Settings',
    pathTemplate: '/dashboard/:orgSlug/settings/analytics',
    fallbackPath: '/dashboard',
    snippet: 'Configure analytics and Google Search Console connections.',
    body: 'Analytics settings lets customers connect GA4 and Search Console and manage reporting-related settings.',
    icon: 'chart-bar',
    section: 'Settings',
    keywords: ['analytics', 'ga4', 'search console', 'reporting'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-overview',
    title: 'Site Overview',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug',
    fallbackPath: '/dashboard',
    snippet: 'Open the current site overview and summary.',
    body: 'The site overview is the hub for site-level management before drilling into location-specific content.',
    icon: 'file-stack',
    section: 'Site',
    keywords: ['site overview', 'site', 'summary'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-conversations',
    title: 'Conversations',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/conversations',
    fallbackPath: '/dashboard',
    snippet: 'Browse site conversations and ChowBot history.',
    body: 'Conversations shows cross-channel discussions and authenticated ChowBot-related message history.',
    icon: 'messages-square',
    section: 'Site',
    keywords: ['conversations', 'messages', 'chat', 'history'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-locations',
    title: 'Locations',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations',
    fallbackPath: '/dashboard',
    snippet: 'Browse every location belonging to the current site.',
    body: 'The locations index is the complete directory for the site and the entry point for adding a location.',
    icon: 'map-pin',
    section: 'Site',
    keywords: ['locations', 'branches', 'site directory'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-domains',
    title: 'Domains',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/domains',
    fallbackPath: '/dashboard',
    snippet: 'Add and manage custom domains for the current site.',
    body: 'The site Domains page connects custom domains, shows exact DNS records, checks validation status, and manages primary domain state.',
    icon: 'globe',
    section: 'Site',
    keywords: ['domains', 'custom domain', 'dns', 'ssl', 'site domains'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-settings',
    title: 'Site Settings',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/settings',
    fallbackPath: '/dashboard',
    snippet: 'Manage site-wide brand, navigation, footer, SEO, and notification defaults.',
    body: 'Site settings owns configuration shared across the selected site, distinct from organization and location settings.',
    icon: 'settings',
    section: 'Site',
    keywords: ['site settings', 'brand', 'seo', 'footer', 'notifications'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-overview',
    title: 'Location Overview',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug',
    fallbackPath: '/dashboard',
    snippet: 'Open the selected location overview.',
    body: 'The location overview summarizes status, profile, integrations, and links without embedding the settings form.',
    icon: 'map-pin',
    section: 'Location',
    keywords: ['location overview', 'branch', 'workspace'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-settings',
    title: 'Location Settings',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/settings',
    fallbackPath: '/dashboard',
    snippet: 'Manage the selected location profile, address, hours, notifications, and integrations.',
    body: 'Location settings contains only configuration owned by one location.',
    icon: 'settings',
    section: 'Location',
    keywords: ['location settings', 'address', 'hours', 'google business', 'notifications'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-content',
    title: 'Content Editor',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/content',
    fallbackPath: '/dashboard',
    snippet: 'Edit customer-facing content for the current location.',
    body: 'The content editor covers page copy, sections, media-adjacent content, and live preview workflows.',
    icon: 'file-pen',
    section: 'Location',
    keywords: ['content', 'editor', 'copy', 'pages'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-menu',
    title: 'Menu',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/menu',
    fallbackPath: '/dashboard',
    snippet: 'Manage menu items and offering structure.',
    body: 'Menu is where restaurants edit items, prices, descriptions, and menu ordering.',
    icon: 'utensils-crossed',
    section: 'Location',
    keywords: ['menu', 'items', 'prices', 'offerings'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-experiences',
    title: 'Experiences',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/experiences',
    fallbackPath: '/dashboard',
    snippet: 'Manage experience listings and bookable offerings.',
    body: 'Experiences is where experience businesses manage bookable listings, descriptions, and related presentation content.',
    icon: 'ticket',
    section: 'Location',
    keywords: ['experiences', 'bookings', 'offerings', 'activities'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-media',
    title: 'Media Library',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/media',
    fallbackPath: '/dashboard',
    snippet: 'Search and manage reusable media assets for the site.',
    body: 'Media library includes site-wide file search, uploads, and asset management for customer-facing content.',
    icon: 'images',
    section: 'Site',
    keywords: ['media', 'library', 'images', 'files'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-photos',
    title: 'Photos',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/photos',
    fallbackPath: '/dashboard',
    snippet: 'Manage photo selections used on the site.',
    body: 'Photos helps customers curate visible gallery imagery for the location.',
    icon: 'camera',
    section: 'Location',
    keywords: ['photos', 'gallery', 'images'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-inbox',
    title: 'Site Inbox',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/inbox',
    fallbackPath: '/dashboard',
    snippet: 'Review guest work across the site.',
    body: 'Site Inbox aggregates accessible guest threads across contact messages, reservations, and experience bookings, including site-wide unassigned messages.',
    icon: 'inbox',
    section: 'Operations',
    keywords: ['inbox', 'submissions', 'messages', 'contact requests', 'guest threads'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-inbox',
    title: 'Location Inbox',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/inbox',
    fallbackPath: '/dashboard',
    snippet: 'Review submissions assigned to one location.',
    body: 'Location Inbox covers only guest threads assigned to the active location, without duplicating site-wide unassigned messages.',
    icon: 'inbox',
    section: 'Operations',
    keywords: ['inbox', 'submissions', 'messages', 'contact requests'],
    surfaces: ['dashboard'],
  },
  {
    id: 'site-testimonials',
    title: 'Testimonials',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/testimonials',
    fallbackPath: '/dashboard',
    snippet: 'Manage owner-entered testimonials and publication provenance.',
    body: 'Testimonials covers owner-entered customer praise, provenance, authorization, and customer trust content.',
    icon: 'star',
    section: 'Site',
    keywords: ['testimonials', 'reviews', 'customer praise'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-reservations',
    title: 'Reservations',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/reservations',
    fallbackPath: '/dashboard',
    snippet: 'Review reservation submissions and related workflows.',
    body: 'Reservations shows inbound reservation requests and booking workflow support data.',
    icon: 'calendar',
    section: 'Operations',
    keywords: ['reservations', 'bookings', 'calendar'],
    surfaces: ['dashboard'],
  },
  {
    id: 'location-analytics',
    title: 'Location Analytics',
    pathTemplate: '/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/analytics',
    fallbackPath: '/dashboard',
    snippet: 'Open analytics for the current location.',
    body: 'Location analytics shows performance, traffic, and operational metrics for the selected location.',
    icon: 'chart-bar',
    section: 'Operations',
    keywords: ['analytics', 'traffic', 'performance'],
    surfaces: ['dashboard'],
  },
]

export function getDocPath(category: string | null | undefined, slug: string | null | undefined): string | null {
  const categorySlug = categoryToSlug(category)
  if (!categorySlug || !slug) return null
  return `/docs/${categorySlug}/${slug}`
}

export function getPlatformBlogPath(category: string | null | undefined, slug: string | null | undefined): string | null {
  return getBlogPostPath(category, slug)
}

export function resolveDashboardPath(pathTemplate: string, context: DashboardRouteContext = {}) {
  const replacements: Record<string, string | null | undefined> = {
    ':orgSlug': context.orgSlug,
    ':siteSlug': context.siteSlug,
    ':locationSlug': context.locationSlug,
  }

  let resolved = pathTemplate
  for (const [token, value] of Object.entries(replacements)) {
    if (!resolved.includes(token)) continue
    if (!value) return null
    resolved = resolved.replaceAll(token, value)
  }

  return resolved
}
