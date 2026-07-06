<template>
  <UPage>
    <UPageBody>
      <div class="max-w-4xl space-y-8">
        <section class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary">ChatGPT setup</p>
          <h1 class="text-2xl font-semibold text-highlighted">Connect KrabiClaw to ChatGPT</h1>
          <p class="max-w-2xl text-sm leading-relaxed text-muted">
            Use the docs for the full install flow, then come back here to copy the MCP server URL.
            After you install the app on the web, you can use the same connected app in ChatGPT web or the mobile apps on iPhone and Android.
          </p>
        </section>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="space-y-4 p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Setup docs</p>
                <p class="mt-1 text-sm leading-relaxed text-muted">
                  Follow the step-by-step guide for the current ChatGPT setup flow.
                </p>
              </div>
              <UButton to="/docs/integrations/mcp-setup" color="neutral" variant="outline">
                Open setup docs
              </UButton>
            </div>

            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">MCP server URL</p>
              <div class="mt-2 flex items-center gap-2 rounded-xl border border-default bg-elevated px-3 py-2">
                <code class="min-w-0 flex-1 truncate text-xs text-highlighted">{{ mcpUrl }}</code>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="copied ? 'i-lucide-check' : 'i-lucide-clipboard'"
                  @click="copyUrl"
                >
                  {{ copied ? 'Copied' : 'Copy' }}
                </UButton>
              </div>
              <div class="mt-4 flex flex-col gap-3">
                <p class="text-xs text-muted leading-relaxed">
                  This page only keeps the connection details handy. The full setup steps live in the docs so we do not duplicate them in two places.
                </p>
                <p class="text-xs text-muted leading-relaxed">
                  This is the <strong>client workspace app</strong>. Internal KrabiClaw platform-admin tools use a separate MCP app and should not be shared with clients.
                </p>
              </div>
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
