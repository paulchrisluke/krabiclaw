export interface DashboardSiteStatusInput {
  status: string | null
  onboarding_status: string | null
}

export interface DashboardSiteStatusPresentation {
  label: 'Published' | 'Setup incomplete'
  color: 'success' | 'warning'
  icon: 'i-lucide-circle-check' | 'i-lucide-circle-dashed'
}

export function getDashboardSiteStatus(site: DashboardSiteStatusInput): DashboardSiteStatusPresentation {
  if (site.status === 'active' && site.onboarding_status === 'active') {
    return {
      label: 'Published',
      color: 'success',
      icon: 'i-lucide-circle-check',
    }
  }

  return {
    label: 'Setup incomplete',
    color: 'warning',
    icon: 'i-lucide-circle-dashed',
  }
}
