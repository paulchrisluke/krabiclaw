<template>
  <div
    class="tenant-layout saya-theme min-h-screen flex flex-col font-sans bg-default text-default"
    :style="themeStyles"
    :data-hydrated="hydrated ? 'true' : 'false'"
    :data-public-critical-shell="isHome ? 'true' : undefined"
    :data-font-preset="fontPreset"
  >
    <!-- Teleport target for Saya components (e.g. BookingModal) that need to escape
         page overflow/stacking contexts but still must render inside this div to
         inherit the --ui-*/--brand-color tokens .saya-theme and themeStyles set here.
         Teleporting straight to <body> puts them outside this scope entirely, which
         reads as the modal falling back to the platform's default (non-Saya) theme.
         Placed before the page content (rather than after) so it precedes any
         Teleport source in document order during SSR — Teleport targets that only
         appear later in the same render caused a hydration child-count mismatch. -->
    <div id="saya-portal-root" />

    <SayaHeader
      :site="resolvedSite"
      :locations="locations"
      :has-products="shell.hasProducts.value"
      :has-bookable-products="shell.hasBookableProducts.value"
    />
    <main class="grow" :data-route-shell="route.path">
      <slot />
    </main>
    <LazySayaFooter
      :site="resolvedSite"
      :is-platform="isPlatform"
      :locations="footerLocations"
      :locales="locales"
      :error="bootstrapError"
      :config="config"
      :has-products="shell.hasProducts.value"
      :has-bookable-products="shell.hasBookableProducts.value"
    />
  </div>
</template>

<script setup lang="ts">
import sayaCriticalCss from '~/assets/css/saya-critical.css?raw'
import '~/assets/css/saya-entry.css'
import { MALI_FONT_CSS, resolveSiteFontPreset, siteFontStyles } from '~/shared/site-fonts'

const route = useRoute()
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })
const { locale: activeLocale } = useI18n()
const isHome = computed(() => route.path === '/'
  || (activeLocale.value !== 'en' && route.path === `/${activeLocale.value}`))
const sayaStylesheetHref = '/_nuxt/surfaces/saya.css'
const sayaStylesheetForRoute = computed(() => {
  return sayaStylesheetHref
})

useHead(() => {
  return {
    htmlAttrs: { lang: activeLocale.value },
    link: [
      { rel: 'preconnect', href: 'https://imagedelivery.net' },
      { rel: 'preconnect', href: 'https://media.krabiclaw.com' },
      {
        key: isHome.value ? 'saya-home-stylesheet' : 'saya-surface-stylesheet',
        rel: 'stylesheet',
        href: sayaStylesheetForRoute.value,
      },
    ],
    style: isHome.value ? [{ innerHTML: sayaCriticalCss, tagPriority: 'critical' }] : [],
  }
})

if (import.meta.dev) useDebugLCP()

// Persistent chrome uses the minimal shell contract. Route-specific Product and
// experience data comes from the keyed page loader and changes independently.
const shell = useSiteShellState()
// The layout's root attributes are serialized before its children render.
// Await the existing keyed shell on every SSR route, not only the homepage,
// so a direct menu/contact visit cannot serialize Default and hydrate as Mali.
if (import.meta.server) await shell.ready
const { config, locations, locales, error: bootstrapError, site: shellSite } = shell
const { isPlatform, site } = useTenantSite()
const resolvedSite = computed(() => shellSite.value || site)
const brandColor = computed(
  () => config.value?.brand_color || null
)
const brandTextColor = computed(() => getContrastColor(brandColor.value))
const fontPreset = computed(() => resolveSiteFontPreset(config.value.font_preset))

// The existing SSR shell supplies the choice. No mounted font loader, extra
// settings request, global font stylesheet, or font preloads: the faces are
// `optional`, and the head's preload is the page's hero (useHeroLcpPreload).
useHead(() => ({
  style: fontPreset.value === 'mali'
    ? [{ key: 'saya-font-preset', innerHTML: MALI_FONT_CSS, tagPriority: 'critical' }]
    : [],
}))

const themeStyles = computed(() => {
  const styles = siteFontStyles(fontPreset.value)
  if (brandColor.value) {
    styles['--brand-color'] = brandColor.value
    styles['--brand-color-foreground'] = brandTextColor.value
  }
  return styles
})

// A page under /locations/<slug> is about exactly one location: the location
// itself, its menu, or a single dish. Printing every location's address, phone
// and today's hours in the footer of those pages was the single largest source
// of duplicate text on Kikuzuki's 896 dish pages — that block was roughly half
// of each page's ~124 visible words and byte-identical across all of them. The
// footer now carries the location the page is actually about, which also makes
// the 84 dishes sold at two locations genuinely distinct pages.
//
// Slug matching works in every locale because the shell's locations are fetched
// per locale and carry the same localized slugs the route does.
const scopedLocationSlug = computed(() => {
  const path = route.path
  const localePrefix = `/${activeLocale.value}`
  const sourcePath = activeLocale.value !== 'en' && path.startsWith(localePrefix)
    ? path.slice(localePrefix.length)
    : path
  const matched = sourcePath.match(/^\/locations\/([^/]+)/)?.[1]
  if (matched === undefined) return null
  try {
    return decodeURIComponent(matched)
  }
  catch {
    // A segment that is not a valid escape sequence. The request layer decodes
    // the pathname first and answers 400 for the ones I could construct
    // (`/locations/%`, `/locations/%252`), so nothing reaches here today —
    // this layout does not decide its own behaviour on that staying true. A
    // segment naming no location scopes the footer to nothing, and the page
    // below answers with its own 404.
    return null
  }
})
const footerLocations = computed(() => (scopedLocationSlug.value === null
  ? locations.value
  : locations.value.filter(location => location.slug === scopedLocationSlug.value)))


// Request-scoped URL state must be captured eagerly during setup. Tenant routing
// already 301s alternate subdomains to the configured custom domain, so the
// rendered request origin is the canonical origin for every indexable tenant page.
const requestURL = useRequestURL()
const requestHostname = requestURL.hostname

if (import.meta.client) {
  const sayaTheme = usePlatformTheme()
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemThemeChange = () => sayaTheme.sync()

  onMounted(() => sayaTheme.restore())
  prefersDark.addEventListener('change', onSystemThemeChange)
  const stopThemeWatch = watch(sayaTheme.preference, sayaTheme.sync)

  onBeforeUnmount(() => {
    prefersDark.removeEventListener('change', onSystemThemeChange)
    stopThemeWatch()
  })
}

// Shared demo-host check: the synthetic "Ember & Slice" showcase site isn't a
// real business collecting real visitor data, so it's excluded from search
// (see the discoverability below) and skips the cookie-consent banner rather
// than asking demo visitors to accept/reject tracking that isn't happening.
// Matches these exact hosts (see seed-definitions/demo.ts siteDomains) rather
// than a "demo." prefix — a real tenant's own custom domain (e.g.
// demo.example.com) can legitimately start with "demo." and must not be
// treated as our internal showcase site.
const DEMO_HOSTS = new Set(['demo.krabiclaw.com', 'demo.localhost'])
const isDemoHost = DEMO_HOSTS.has(requestHostname)

useSocialMetadata(() => ({
  path: route.path,
  title: config.value?.seo_title || config.value?.name || resolvedSite.value?.name || '',
  description: config.value?.seo_description || config.value?.brand_description || '',
  brand: {
    siteName: config.value?.name || resolvedSite.value?.name || '',
  },
  // Everything a live site serves is offered to discovery; the showcase site
  // is not a real business and is offered to nobody. A page that is itself
  // unlisted, and any preview render, says so over this.
  discoverability: isDemoHost ? 'private' : 'listed',
}))
</script>

<style>
/* Saya theme CSS variables */
.saya-theme {
  /* A site that has not chosen a colour yet wears the platform's, so the first
     preview in onboarding already looks like KrabiClaw rather than a green
     nobody picked. themeStyles above replaces both values the moment the owner
     answers the brand step. */
  --brand-color: var(--kc-coral);
  --brand-color-foreground: #fff;
}
</style>
