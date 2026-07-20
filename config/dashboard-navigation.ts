// Declarative dashboard navigation structures. These are pure builder
// functions over already-resolved paths/state — they must not construct
// route strings themselves (that stays owned by useDashboardSiteLinks.ts /
// useDashboardLocation.ts) and must not fetch data or hold state.
// `composables/useDashboardNavigation.ts` resolves context and calls these.

export interface NavItem {
  label: string
  icon: string
  to?: string
  active?: boolean
}

export function buildMainNavigation(paths: {
  dashboardHome: string
  conversationsPath: string | null
  translationsPath: string | null
  activityPath: string | null
  orgSettingsBase: string | null
}): NavItem[][] {
  return [
    [
      { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: paths.dashboardHome },
      { label: 'Conversations', icon: 'i-lucide-messages-square', to: paths.conversationsPath ?? paths.dashboardHome },
    ],
    [
      { label: 'Translations', icon: 'i-lucide-languages', to: paths.translationsPath ?? paths.dashboardHome },
      { label: 'Activity', icon: 'i-lucide-activity', to: paths.activityPath ?? paths.dashboardHome },
    ],
    ...(paths.orgSettingsBase ? [[{ label: 'Settings', icon: 'i-lucide-settings', to: paths.orgSettingsBase }]] : []),
  ]
}

export function buildLocationNavigation(paths: {
  overview: string
  content: string
  inbox: string
}): NavItem[][] {
  return [
    [{ label: 'Overview', icon: 'i-lucide-layout-dashboard', to: paths.overview }],
    [{ label: 'Content', icon: 'i-lucide-copy', to: paths.content }],
    [{ label: 'Inbox', icon: 'i-lucide-inbox', to: paths.inbox }],
  ]
}

export function buildAccountSettingsNavigation(): NavItem[][] {
  return [[
    { label: 'Account Profile', icon: 'i-lucide-user', to: '/dashboard/account/settings' },
    { label: 'Authentication', icon: 'i-lucide-shield', to: '/dashboard/account/settings/authentication' },
    { label: 'Billing Items', icon: 'i-lucide-receipt', to: '/dashboard/account/settings/billing-items' },
  ]]
}

export function buildOrgSettingsNavigation(orgSettingsBase: string | null): NavItem[][] {
  if (!orgSettingsBase) return [[]]
  return [[
    { label: 'General', icon: 'i-lucide-sliders-horizontal', to: `${orgSettingsBase}/general` },
    { label: 'ChatGPT', icon: 'i-lucide-bot', to: `${orgSettingsBase}/chatgpt` },
    { label: 'Domains', icon: 'i-lucide-globe', to: `${orgSettingsBase}/domains` },
    { label: 'Analytics', icon: 'i-lucide-chart-bar', to: `${orgSettingsBase}/analytics` },
    { label: 'Billing', icon: 'i-lucide-credit-card', to: `${orgSettingsBase}/billing` },
    { label: 'Members', icon: 'i-lucide-users', to: `${orgSettingsBase}/members` },
  ]]
}

export function buildAdminNavigation(activeTab: string, managedServiceEnabled: boolean): NavItem[][] {
  return [[
    ...(managedServiceEnabled
      ? [{ label: 'Work Queue', icon: 'i-lucide-list-todo', to: '/admin?tab=work', active: activeTab === 'work' }]
      : []),
    { label: 'Add-ons', icon: 'i-lucide-inbox', to: '/admin?tab=queue', active: activeTab === 'queue' },
    { label: 'Clients', icon: 'i-lucide-building-2', to: '/admin?tab=clients', active: activeTab === 'clients' },
    { label: 'Members', icon: 'i-lucide-user-plus', to: '/admin?tab=members', active: activeTab === 'members' },
    { label: 'Analytics', icon: 'i-lucide-chart-bar', to: '/admin?tab=analytics', active: activeTab === 'analytics' },
    { label: 'Domains', icon: 'i-lucide-globe', to: '/admin?tab=domains', active: activeTab === 'domains' },
    { label: 'Users', icon: 'i-lucide-users', to: '/admin?tab=users', active: activeTab === 'users' },
    { label: 'Content', icon: 'i-lucide-file-text', to: '/admin?tab=content', active: activeTab === 'content' },
    { label: 'Blog', icon: 'i-lucide-pencil', to: '/admin?tab=blog', active: activeTab === 'blog' },
  ]]
}

// Route-segment → navbar title. Only used as a last-resort default when a
// page doesn't own its own title via DashboardPage/DashboardWorkspacePage.
export const routeTitleLabels: Record<string, string> = {
  account: 'Account',
  activity: 'Activity',
  analytics: 'Analytics',
  billing: 'Billing',
  blog: 'Blog',
  chatgpt: 'ChatGPT',
  conversations: 'Conversations',
  content: 'Content',
  experiences: 'Experiences',
  inbox: 'Inbox',
  locations: 'Locations',
  media: 'Media',
  menu: 'Menu',
  order: 'Orders',
  pages: 'Pages',
  photos: 'Photos',
  posts: 'Posts',
  qa: 'Q&A',
  reservations: 'Reservations',
  reviews: 'Reviews',
  settings: 'Settings',
  setup: 'Setup',
  translations: 'Translations',
}
