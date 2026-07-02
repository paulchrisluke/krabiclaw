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
          <PlatformHeader />
          <main class="dev-perf-shell-body">
            <h3>Static body</h3>
            <p>
              No production page content is rendered here. The shell is the variable.
            </p>
          </main>
          <PlatformFooter />
        </UTheme>
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
import PlatformFooter from '~/components/platform/PlatformFooter.vue'
import PlatformHeader from '~/components/platform/PlatformHeader.vue'

definePageMeta({
  layout: false,
})

const url = useRequestURL()
const requestHeaders = useRequestHeaders(['host', 'cf-ray'])
const allowedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'local.krabiclaw.com'])
const isLocalWranglerPlatformHost = requestHeaders.host === 'krabiclaw.com' && !requestHeaders['cf-ray']
const route = useRoute()
const modes = new Set(['text', 'ui', 'icons', 'icons-client-only', 'icon-placeholders', 'platform-shell', 'static-shell'])
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
const staticNavItems = [
  { label: 'Plugin', to: '/plugin' },
  { label: 'Features', to: '/features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Docs', to: '/docs' },
  { label: 'Blog', to: '/blog' },
]

if (!allowedHosts.has(url.hostname) && !isLocalWranglerPlatformHost) {
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
</style>
