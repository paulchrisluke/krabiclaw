import japaneseFontsUrl from '~/assets/css/japanese-fonts.css?url'

// The site's font preset for a public layout's root, and the Japanese faces on
// a Japanese page. Every public template uses this; the dashboard does not, so
// its own typography never changes with a site's choice.
export function usePublicSiteTypography() {
  const { fontPreset } = useTenantOrganization()
  const locale = useState<string>('public-locale', () => 'en')
  useHead(() => ({
    link: locale.value === 'ja' ? [{ key: 'japanese-fonts', rel: 'stylesheet', href: japaneseFontsUrl }] : [],
  }))
  return fontPreset
}
