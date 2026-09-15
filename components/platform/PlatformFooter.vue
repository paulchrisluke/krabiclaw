<template>
  <footer class="border-t border-default bg-(color:--kc-footer-bg) text-default">
    <div class="mx-auto max-w-304 px-6 pb-8 pt-16">

      <div class="mb-12 grid grid-cols-2 gap-8 md:grid-cols-[1.4fr_repeat(4,1fr)] md:gap-10">
        <div class="col-span-2 md:col-span-1">
          <NuxtLink to="/" class="group inline-flex items-center gap-2.5 no-underline">
            <img src="/krabi-claw-logo-96.webp" alt="KrabiClaw" width="34" height="34" class="size-8.5 rounded-lg transition-transform duration-200 group-hover:rotate-12" />
            <span class="kc-wordmark text-[19px] leading-none">
              <span class="kc-wordmark__krabi">krabi</span><span class="kc-wordmark__claw">claw</span><span class="kc-wordmark__tld">.com</span>
            </span>
          </NuxtLink>
          <p class="mt-3.5 max-w-75 text-[13px] leading-relaxed text-muted">
            The AI-managed web operating layer for local and professional businesses. Empowering independent owners globally. 🦀
          </p>
          <div class="mt-5 flex items-center gap-4 text-dimmed">
            <a href="https://github.com/paulchrisluke/krabiclaw/" target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-default">
              <span class="sr-only">GitHub</span>
              <svg viewBox="0 0 24 24" fill="currentColor" class="size-5">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </a>
          </div>
        </div>

        <div v-for="column in COLUMNS" :key="column.title">
          <div class="mb-3.5 text-[11px] font-bold uppercase tracking-[0.18em] text-dimmed">{{ column.title }}</div>
          <ul class="flex list-none flex-col gap-2.5 p-0">
            <li v-for="link in column.links" :key="link.to">
              <NuxtLink :to="link.to" class="text-[14px] text-muted no-underline transition-colors hover:text-default">
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4 border-t border-default pt-6 text-[12px] text-dimmed">
        <p class="max-w-[60ch]">&copy; {{ new Date().getFullYear() }} KrabiClaw. All rights reserved. Built for independent businesses globally.</p>
        <div class="flex items-center gap-4">
          <ZarazConsentButton />
          <!-- The only visible public theme control. It sets an explicit
               preference, so a visitor who never clicks it stays on `system`. -->
          <button
            type="button"
            class="grid size-8.5 place-items-center rounded-lg border border-default text-muted transition-colors hover:bg-muted hover:text-default"
            :aria-label="resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="setPreference(resolvedTheme === 'dark' ? 'light' : 'dark')"
          >
            <PlatformIcon :name="resolvedTheme === 'dark' ? 'sun' : 'moon'" class="size-4" />
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
// Approved shell terminology: `Professional Services` and `MCP`. #939 owns the
// canonical /services and /mcp route migration; until then these point at the
// destinations that work today.
const COLUMNS = [
  {
    title: 'Solutions',
    links: [
      { label: 'Restaurants', to: '/restaurants' },
      { label: 'Experiences', to: '/experiences' },
      { label: 'Professional Services', to: '/legal' },
    ],
  },
  {
    title: 'Product',
    links: [
      { label: 'MCP', to: '/plugin' },
      { label: 'Features', to: '/features' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Templates', to: '/templates' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Blog', to: '/blog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', to: '/docs' },
      { label: 'Help center', to: '/help' },
      { label: 'Privacy policy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
] as const

const { value: resolvedTheme, setPreference } = usePlatformTheme()
</script>
