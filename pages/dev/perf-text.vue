<template>
  <main class="dev-perf-page">
    <h1>KrabiClaw local text performance page</h1>
    <p>
      This page intentionally renders plain text through Nuxt with no layout,
      no components, no images, and no data fetching.
    </p>
    <p>
      Use it to compare the baseline Nuxt app shell against real pages before
      changing production speed code.
    </p>

    <section v-if="mode === 'ui'" class="dev-perf-section" aria-label="Nuxt UI render test">
      <h2>Nuxt UI render test</h2>
      <p>
        This mode adds Nuxt UI components without icon props.
      </p>
      <UCard class="dev-perf-card">
        <template #header>
          <strong>Plain Nuxt UI card</strong>
        </template>
        <p>
          Static text inside a card, plus two buttons rendered without icons.
        </p>
        <div class="dev-perf-actions">
          <UButton label="Primary action" color="primary" />
          <UButton label="Neutral action" color="neutral" variant="soft" />
        </div>
      </UCard>
    </section>

    <section v-else-if="mode === 'icons'" class="dev-perf-section" aria-label="Icon render test">
      <h2>Icon render test</h2>
      <p>
        This mode adds the same Nuxt UI icon component used across public pages.
      </p>
      <ul>
        <li v-for="icon in icons" :key="icon">
          <UIcon :name="icon" class="dev-perf-icon" />
          <span>{{ icon }}</span>
        </li>
      </ul>
    </section>

    <section v-else-if="mode === 'icons-client-only'" class="dev-perf-section" aria-label="Client-only icon render test">
      <h2>Client-only icon render test</h2>
      <p>
        This mode keeps UIcon in the page but removes it from SSR.
      </p>
      <ul>
        <li v-for="icon in icons" :key="icon">
          <ClientOnly>
            <UIcon :name="icon" class="dev-perf-icon" />
            <template #fallback>
              <span class="dev-perf-icon dev-perf-icon-placeholder" aria-hidden="true" />
            </template>
          </ClientOnly>
          <span>{{ icon }}</span>
        </li>
      </ul>
    </section>

    <section v-else-if="mode === 'icon-placeholders'" class="dev-perf-section" aria-label="Icon placeholder render test">
      <h2>Icon placeholder render test</h2>
      <p>
        This mode keeps the icon-sized layout slots but does not render UIcon.
      </p>
      <ul>
        <li v-for="icon in icons" :key="icon">
          <span class="dev-perf-icon dev-perf-icon-placeholder" aria-hidden="true" />
          <span>{{ icon }}</span>
        </li>
      </ul>
    </section>

    <section v-else-if="mode === 'platform-shell'" class="dev-perf-section dev-perf-platform-shell" aria-label="Platform shell render test">
      <h2>Platform shell render test</h2>
      <p>
        This mode renders the real platform header and footer around static text.
      </p>
      <div class="dev-perf-shell-frame">
        <UTheme :ui="{}">
          <LazyPlatformHeader />
          <main class="dev-perf-shell-body">
            <h3>Static body</h3>
            <p>
              No production page content is rendered here. The shell is the variable.
            </p>
          </main>
          <LazyPlatformFooter />
        </UTheme>
      </div>
    </section>

    <section v-else-if="mode === 'saya-header'" class="dev-perf-section dev-perf-platform-shell" aria-label="Saya header render test">
      <h2>Saya header render test</h2>
      <p>
        This mode renders the real Saya header around static text.
      </p>
      <div class="dev-perf-shell-frame saya-theme">
        <UTheme :ui="{}">
          <LazySayaHeader />
          <main class="dev-perf-shell-body">
            <h3>Static body</h3>
            <p>The Saya header is the variable.</p>
          </main>
        </UTheme>
      </div>
    </section>

    <section v-else-if="mode === 'saya-footer'" class="dev-perf-section dev-perf-platform-shell" aria-label="Saya footer render test">
      <h2>Saya footer render test</h2>
      <p>
        This mode renders the real Saya footer around static text.
      </p>
      <div class="dev-perf-shell-frame saya-theme">
        <UTheme :ui="{}">
          <main class="dev-perf-shell-body">
            <h3>Static body</h3>
            <p>The Saya footer is the variable.</p>
          </main>
          <LazySayaFooter />
        </UTheme>
      </div>
    </section>

    <section v-else-if="mode === 'saya-shell'" class="dev-perf-section dev-perf-platform-shell" aria-label="Saya shell render test">
      <h2>Saya shell render test</h2>
      <p>
        This mode renders the real Saya header and footer around static text.
      </p>
      <div class="dev-perf-shell-frame saya-theme">
        <UTheme :ui="{}">
          <LazySayaHeader />
          <main class="dev-perf-shell-body">
            <h3>Static body</h3>
            <p>No production tenant page content is rendered here.</p>
          </main>
          <LazySayaFooter />
        </UTheme>
      </div>
    </section>

    <section v-else-if="mode === 'saya-static-shell'" class="dev-perf-section dev-perf-platform-shell" aria-label="Static Saya shell render test">
      <h2>Static Saya shell render test</h2>
      <p>
        This mode renders Saya-shaped header/footer markup without real Saya components.
      </p>
      <div class="dev-perf-shell-frame saya-theme">
        <header class="dev-perf-static-header">
          <NuxtLink to="/" class="dev-perf-static-brand">
            <span class="dev-perf-static-mark">S</span>
            <span>Saya tenant</span>
          </NuxtLink>
          <nav class="dev-perf-static-nav" aria-label="Static Saya test navigation">
            <NuxtLink v-for="item in sayaStaticNavItems" :key="item.to" :to="item.to">
              {{ item.label }}
            </NuxtLink>
          </nav>
        </header>
        <main class="dev-perf-shell-body">
          <h3>Static body</h3>
          <p>This is the tenant static shell control.</p>
        </main>
        <footer class="dev-perf-static-footer">
          Static Saya footer text
        </footer>
      </div>
    </section>

    <section v-else-if="mode === 'simple-icons'" class="dev-perf-section" aria-label="Simple Icons render test">
      <h2>Simple Icons render test</h2>
      <p>
        This mode renders the social icon collection used by Saya footer social links.
      </p>
      <ul>
        <li v-for="icon in simpleIcons" :key="icon">
          <UIcon :name="icon" class="dev-perf-icon" />
          <span>{{ icon }}</span>
        </li>
      </ul>
    </section>

    <section v-else-if="mode === 'text-no-icons'" class="dev-perf-section" aria-label="No-icons baseline test">
      <h2>No-icons baseline test</h2>
      <p>
        Explicit alias for the plain-text baseline — same as the default
        <code>text</code> mode, given its own name so the timing script's
        mode list is self-documenting and can't silently fall back to
        <code>text</code> on a typo.
      </p>
    </section>

    <section v-else-if="mode === 'text-with-one-icon'" class="dev-perf-section" aria-label="Single icon render test">
      <h2>Single icon render test</h2>
      <p>
        This mode renders exactly one UIcon, to isolate the fixed cost of
        engaging the Icon module/server bundle at all from the marginal
        per-icon cost measured by the full <code>icons</code> mode.
      </p>
      <UIcon name="i-heroicons-bolt" class="dev-perf-icon" />
    </section>

    <section v-else-if="mode === 'text-with-ui-button'" class="dev-perf-section" aria-label="Single UI button render test">
      <h2>Single UI button render test</h2>
      <p>
        This mode renders a single UButton with no icon and no UCard wrapper,
        to isolate baseline Nuxt UI component overhead from the heavier
        <code>ui</code> mode (card + two buttons).
      </p>
      <UButton label="Primary action" color="primary" />
    </section>

    <section v-else-if="mode === 'text-with-i18n'" class="dev-perf-section" aria-label="i18n render test">
      <h2>i18n render test</h2>
      <p>
        This mode calls <code>useI18n()</code> and renders one real
        <code>$t()</code> lookup, to isolate the cost of engaging the i18n
        runtime/locale message resolution during SSR.
      </p>
      <p>{{ t('saya.header.menu') }} (locale: {{ locale }})</p>
    </section>

    <section v-else-if="mode === 'text-with-analytics-plugin'" class="dev-perf-section" aria-label="Analytics composable render test">
      <h2>Analytics composable render test</h2>
      <p>
        This mode calls <code>useAnalytics()</code> and <code>getGaClientId()</code>
        on the page, to isolate whether wiring in the analytics composable adds
        any SSR cost. Note: the GA4 `&lt;script&gt;` tag itself is injected
        globally by <code>app.vue</code> on every page (including the
        <code>text</code> baseline), so this mode only isolates the
        composable call, not the script tag.
      </p>
      <p>GA client id (client-only, expect null during SSR): {{ gaClientId }}</p>
    </section>

    <section v-else-if="mode === 'text-with-layout'" class="dev-perf-section" aria-label="Layout mechanism render test">
      <h2>Layout mechanism render test</h2>
      <p>
        This mode wraps static text in the real <code>default</code> layout
        (an empty passthrough <code>&lt;div&gt;&lt;slot /&gt;&lt;/div&gt;</code>)
        via <code>&lt;NuxtLayout&gt;</code>, to isolate the cost of Nuxt's
        layout-resolution machinery itself from the header/footer component
        cost already measured by the shell modes above.
      </p>
      <NuxtLayout name="default">
        <p>Static body rendered inside the default layout.</p>
      </NuxtLayout>
    </section>

    <section v-else-if="mode === 'text-with-saya-css'" class="dev-perf-section" aria-label="Saya theme CSS render test">
      <h2>Saya theme CSS render test</h2>
      <p>
        This mode applies the <code>saya-theme</code> class and the same
        brand-color CSS custom property computation the Saya layout runs
        (<code>calculateThemeColors</code>), without rendering any Saya
        component, to isolate theme-color computation/CSS scoping cost from
        component-tree cost.
      </p>
      <div class="saya-theme dev-perf-saya-css-frame" :style="sayaThemeStyles">
        <p>Static text under saya-theme styling.</p>
      </div>
    </section>

    <section v-else-if="mode === 'static-shell'" class="dev-perf-section dev-perf-platform-shell" aria-label="Static shell render test">
      <h2>Static shell render test</h2>
      <p>
        This mode renders a header/footer-shaped shell without UIcon, UColorModeButton, dropdowns, or nav data composables.
      </p>
      <div class="dev-perf-shell-frame">
        <header class="dev-perf-static-header">
          <NuxtLink to="/" class="dev-perf-static-brand">
            <img src="/krabi-claw-logo.png" alt="KrabiClaw" width="34" height="34">
            <span>krabiclaw.com</span>
          </NuxtLink>
          <nav class="dev-perf-static-nav" aria-label="Static test navigation">
            <NuxtLink v-for="item in staticNavItems" :key="item.to" :to="item.to">
              {{ item.label }}
            </NuxtLink>
          </nav>
        </header>
        <main class="dev-perf-shell-body">
          <h3>Static body</h3>
          <p>
            This keeps shell-like markup and the logo image but removes the dynamic header pieces.
          </p>
        </main>
        <footer class="dev-perf-static-footer">
          Static footer text
        </footer>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
// Intentionally no static imports of PlatformHeader/PlatformFooter/SayaHeader/
// SayaFooter here — the template uses the Lazy* auto-imported variants so
// Vite code-splits them into their own async chunks. A static top-level
// import of an SFC gets bundled into this page's own chunk graph regardless
// of which v-else-if branch actually renders it, which was silently forcing
// every mode (including text-no-icons) to preload the same ~35 chunks.
import { getGaClientId, useAnalytics } from '~/composables/useAnalytics'
import { calculateThemeColors } from '~/utils/color-utils'
import { isDevPerfHostAllowed } from '~/shared/dev-perf'

definePageMeta({
  layout: false,
})

const url = useRequestURL()
const requestHeaders = useRequestHeaders(['host', 'cf-ray'])
const route = useRoute()
const modes = new Set([
  'text',
  'ui',
  'icons',
  'icons-client-only',
  'icon-placeholders',
  'platform-shell',
  'static-shell',
  'saya-header',
  'saya-footer',
  'saya-shell',
  'saya-static-shell',
  'simple-icons',
  'text-no-icons',
  'text-with-one-icon',
  'text-with-ui-button',
  'text-with-i18n',
  'text-with-analytics-plugin',
  'text-with-layout',
  'text-with-saya-css',
])
const mode = computed(() => {
  const requestedMode = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode
  return requestedMode && modes.has(requestedMode) ? requestedMode : 'text'
})
const icons = [
  'i-heroicons-bolt',
  'i-heroicons-globe-alt',
  'i-heroicons-check-circle',
  'i-heroicons-arrow-right',
  'i-heroicons-calendar-days',
  'i-heroicons-document-text',
  'i-heroicons-shopping-bag',
  'i-heroicons-chart-bar',
  'i-heroicons-presentation-chart-line',
  'i-heroicons-question-mark-circle',
  'i-lucide-moon',
  'i-lucide-sun',
]
const simpleIcons = [
  'i-simple-icons-facebook',
  'i-simple-icons-instagram',
  'i-simple-icons-tiktok',
]
const staticNavItems = [
  { label: 'Plugin', to: '/plugin' },
  { label: 'Features', to: '/features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Docs', to: '/docs' },
  { label: 'Blog', to: '/blog' },
]
const sayaStaticNavItems = [
  { label: 'Menu', to: '/menu' },
  { label: 'Reservations', to: '/reservations' },
  { label: 'Experiences', to: '/experiences' },
  { label: 'Contact', to: '/contact' },
]

// useI18n()/useAnalytics() are only invoked for their own mode — calling
// them unconditionally would leak their setup cost into every other mode's
// timing, defeating the point of isolating one variable at a time.
const isI18nMode = mode.value === 'text-with-i18n'
const i18n = isI18nMode ? useI18n() : null
const t = i18n ? i18n.t : (key: string) => key
const locale = i18n ? i18n.locale : ref('en')

const isAnalyticsMode = mode.value === 'text-with-analytics-plugin'
const analytics = isAnalyticsMode ? useAnalytics() : null
const gaClientId = ref<string | null>(null)
onMounted(() => {
  if (!isAnalyticsMode || !analytics) return
  gaClientId.value = getGaClientId()
  analytics.trackEvent('dashboard_visited')
})
// Same brand-color test input the Saya layout would receive from a real
// site's config.brand_color — kept static here since this page has no
// tenant/bootstrap context.
const sayaThemeStyles = computed(() => {
  const colors = calculateThemeColors('#e11d48')
  return {
    '--brand-color': colors.brandColor,
    '--ui-primary': colors.brandColor,
    '--color-primary': colors.brandColor,
    '--brand-color-foreground': colors.brandColorForeground,
  }
})

if (!isDevPerfHostAllowed(requestHeaders.host, !!requestHeaders['cf-ray'])) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Not Found',
  })
}

useHead({
  title: 'Local Text Performance',
  meta: [
    {
      name: 'robots',
      content: 'noindex, nofollow',
    },
  ],
})
</script>

<style scoped>
.dev-perf-page {
  max-width: 68ch;
  margin: 0 auto;
  padding: 48px 20px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #111827;
  background: #ffffff;
}

h1 {
  margin: 0 0 16px;
  font-size: 32px;
  line-height: 1.15;
  font-weight: 700;
}

p {
  margin: 0 0 12px;
  font-size: 18px;
  line-height: 1.6;
}

.dev-perf-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
}

h2 {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.25;
}

ul {
  display: grid;
  gap: 10px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
}

.dev-perf-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
}

.dev-perf-icon-placeholder {
  display: inline-block;
  border: 1px solid #9ca3af;
  border-radius: 5px;
  background: #f9fafb;
}

.dev-perf-card {
  margin-top: 18px;
}

.dev-perf-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.dev-perf-platform-shell {
  max-width: none;
}

.dev-perf-shell-frame {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.dev-perf-shell-body {
  padding: 40px 24px;
}

.dev-perf-shell-body h3 {
  margin: 0 0 10px;
  font-size: 20px;
  line-height: 1.3;
}

.dev-perf-static-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dev-perf-static-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #111827;
  font-weight: 700;
  text-decoration: none;
}

.dev-perf-static-brand img {
  border-radius: 9px;
}

.dev-perf-static-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: #111827;
  color: #ffffff;
}

.dev-perf-static-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.dev-perf-static-nav a {
  color: #4b5563;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.dev-perf-static-footer {
  padding: 24px;
  border-top: 1px solid #e5e7eb;
  color: #6b7280;
  font-size: 14px;
}

.dev-perf-saya-css-frame {
  margin-top: 18px;
  padding: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: var(--brand-color, transparent);
  color: var(--brand-color-foreground, inherit);
}
</style>
