export interface ExperienceNavigationItem {
  slug?: string | null
  status?: string | null
}

export function visibleExperienceItems<T extends ExperienceNavigationItem>(
  experiences: readonly T[] | null | undefined,
): T[] {
  return (experiences ?? []).filter((experience) => experience.status !== 'inactive')
}

export function resolveLocationExperienceHref(
  locationSlug: string | null | undefined,
  experiences: readonly ExperienceNavigationItem[] | null | undefined,
): string | null {
  const slug = locationSlug?.trim()
  if (!slug) return null

  const visible = visibleExperienceItems(experiences)
  if (visible.length === 0) return null
  if (visible.length === 1) {
    const experienceSlug = visible[0]?.slug?.trim()
    return experienceSlug ? `/experiences/${experienceSlug}` : null
  }

  return `/locations/${slug}/experiences`
}

export function resolveSiteExperienceHref(
  experiences: readonly ExperienceNavigationItem[] | null | undefined,
): string | null {
  const visible = visibleExperienceItems(experiences)
  if (visible.length === 0) return null
  if (visible.length === 1) {
    const experienceSlug = visible[0]?.slug?.trim()
    return experienceSlug ? `/experiences/${experienceSlug}` : null
  }

  return '/experiences'
}
