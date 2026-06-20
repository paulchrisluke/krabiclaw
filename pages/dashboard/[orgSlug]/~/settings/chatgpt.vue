<template>
  <UPage>
    <UPageBody>
      <div class="max-w-4xl space-y-8">
        <section class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary">ChatGPT setup</p>
          <h1 class="text-2xl font-semibold text-highlighted">Connect KrabiClaw to ChatGPT</h1>
          <p class="max-w-2xl text-sm leading-relaxed text-muted">
            Use ChatGPT for fast content edits, media requests, and copy updates. Billing, members, domains, and notification routing still live here in the dashboard.
          </p>
        </section>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="grid gap-4 p-4 md:grid-cols-3">
            <div
              v-for="step in steps"
              :key="step.number"
              class="rounded-2xl border border-default bg-elevated px-4 py-4"
            >
              <div class="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
                {{ step.number }}
              </div>
              <p class="mt-4 text-sm font-semibold text-highlighted">{{ step.title }}</p>
              <p class="mt-1.5 text-sm leading-relaxed text-muted">{{ step.body }}</p>
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="space-y-4 p-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">MCP server URL</p>
              <div class="mt-2 flex items-center gap-2 rounded-xl border border-default bg-elevated px-3 py-2">
                <code class="min-w-0 flex-1 truncate text-xs text-highlighted">{{ mcpUrl }}</code>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
                  @click="copyUrl"
                >
                  {{ copied ? 'Copied' : 'Copy' }}
                </UButton>
              </div>
              <p class="mt-2 text-xs text-muted">
                Set authentication to <strong>OAuth</strong> when ChatGPT asks.
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton as="a" href="https://chatgpt.com" target="_blank" rel="noopener" color="primary">
                Open ChatGPT
              </UButton>
              <UButton to="/plugin" color="neutral" variant="ghost">
                View public setup page
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="space-y-4 p-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Best for ChatGPT</p>
              <p class="mt-1 text-sm leading-relaxed text-muted">
                Homepage copy, story rewrites, image generation, FAQ updates, new experiences, menu descriptions, and launch posts.
              </p>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Keep in the dashboard</p>
              <p class="mt-1 text-sm leading-relaxed text-muted">
                Members, billing, domains, notification routing, and any structured edits where you want exact page-by-page control.
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'ChatGPT Setup | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const config = useRuntimeConfig()
const copied = ref(false)

const mcpUrl = computed(() => {
  const base = (config.public.platformDomain as string | undefined) || 'https://krabiclaw.com'
  return `${base.replace(/\/$/, '')}/api/mcp`
})

const steps = [
  {
    number: 1,
    title: 'Open ChatGPT settings',
    body: 'Go to Settings → Connectors, or use Explore GPTs and choose Add MCP server.',
  },
  {
    number: 2,
    title: 'Paste the server URL',
    body: 'Add the KrabiClaw MCP URL below and choose OAuth authentication.',
  },
  {
    number: 3,
    title: 'Sign in and authorize',
    body: 'ChatGPT redirects you back to KrabiClaw to approve access, then you can start editing.',
  },
] as const

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(mcpUrl.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('copy_mcp_url_failed', error)
  }
}
</script>
