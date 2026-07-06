import { categoryToSlug } from './docs-categories'
import { getBlogPostPath } from './blog-categories'

export type PublicSearchType = 'doc' | 'blog' | 'faq' | 'route'

export interface PublicSupportFaqEntry {
  id: string
  title: string
  answer: string
  keywords: string[]
}

export interface PublicSupportRouteCard {
  title: string
  description: string
  to: string
}

export interface PublicSupportTopic {
  label: string
  value: string
}

export const PUBLIC_SUPPORT_ROUTE_CARDS: PublicSupportRouteCard[] = [
  {
    title: 'Browse Documentation',
    description: 'Setup guides, billing details, product walkthroughs, and launch help.',
    to: '/docs',
  },
  {
    title: 'Read Product Updates',
    description: 'Launch notes, strategy posts, and deeper product guidance from the blog.',
    to: '/blog',
  },
]

export const PUBLIC_SUPPORT_TOPICS: PublicSupportTopic[] = [
  { label: 'KrabiClaw Platform', value: 'platform' },
  { label: 'ChowBot', value: 'chowbot' },
]

export const PUBLIC_SUPPORT_FAQ_ENTRIES: PublicSupportFaqEntry[] = [
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
    answer: 'Upgrade to a plan that includes custom domains, add the domain in dashboard settings, and then point the DNS records we provide at KrabiClaw.',
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

export interface PublicSupportRouteMetadata {
  id: string
  title: string
  path: string
  snippet: string
  keywords: string[]
}

export const PUBLIC_SUPPORT_ROUTE_METADATA: PublicSupportRouteMetadata[] = [
  {
    id: 'docs',
    title: 'Documentation',
    path: '/docs',
    snippet: 'Guides for setup, content editing, integrations, billing, and launch workflows.',
    keywords: ['docs', 'documentation', 'guide', 'setup', 'help'],
  },
  {
    id: 'pricing',
    title: 'Pricing',
    path: '/pricing',
    snippet: 'Plan comparison, billing details, and what each paid tier unlocks.',
    keywords: ['pricing', 'plans', 'billing', 'cost', 'subscription'],
  },
  {
    id: 'login',
    title: 'Login',
    path: '/login',
    snippet: 'Sign in to access the dashboard, ChowBot, billing, and site settings.',
    keywords: ['login', 'sign in', 'account', 'dashboard access'],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    path: '/dashboard',
    snippet: 'Manage sites, billing, members, analytics, settings, and support workflows.',
    keywords: ['dashboard', 'workspace', 'manage site', 'admin'],
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
