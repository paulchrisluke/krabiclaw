<template>
  <NuxtLayout name="platform">
    <main class="min-h-screen bg-default pb-24">
      <section class="mx-auto max-w-5xl px-4 pt-20 sm:px-6">
        <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-6">
            <img src="/platform/apple-touch-icon.png" alt="KrabiClaw app icon" class="size-24 rounded-[28px] border border-default shadow-lg">
            <div>
              <h1 class="m-0 text-3xl font-extrabold tracking-tight text-default md:text-4xl">KrabiClaw for ChatGPT</h1>
              <p class="mt-2 text-lg text-muted">Manage your website through an authenticated custom MCP app in ChatGPT.</p>
            </div>
          </div>
          <NuxtLink to="/signup" class="inline-flex justify-center rounded-full bg-(--kc-navy) px-8 py-3.5 font-bold text-white no-underline">
            Create a KrabiClaw account
          </NuxtLink>
        </div>

        <div class="mt-16 grid gap-6 md:grid-cols-3">
          <UCard>
            <template #header><h2 class="text-lg font-bold">Work with live content</h2></template>
            <p class="text-sm leading-relaxed text-muted">Inspect pages, posts, articles, menus, services, locations, media, reviews, and analytics. ChatGPT may request confirmation based on the action, permissions, and impact.</p>
          </UCard>
          <UCard>
            <template #header><h2 class="text-lg font-bold">Use native attachments</h2></template>
            <p class="text-sm leading-relaxed text-muted">Attach a photo in ChatGPT, or attach a video together with its poster image, then ask KrabiClaw to upload and place it. Every video requires a poster; if it is missing, the assistant asks you to attach one before uploading. There is no separate upload widget.</p>
          </UCard>
          <UCard>
            <template #header><h2 class="text-lg font-bold">Keep control</h2></template>
            <p class="text-sm leading-relaxed text-muted">OAuth limits access to sites you can manage. Publishing and destructive actions are identified in the app's tool metadata.</p>
          </UCard>
        </div>
      </section>

      <section class="mx-auto mt-20 max-w-4xl border-t border-default px-4 pt-14 sm:px-6">
        <h2 class="text-3xl font-extrabold text-default">Connect in ChatGPT</h2>
        <p class="mt-3 text-muted">Use ChatGPT on the web. Developer mode availability depends on your account and workspace policy.</p>

        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          <li class="rounded-2xl border border-default bg-elevated p-6">
            <span class="flex size-10 items-center justify-center rounded-xl bg-(--kc-navy) text-lg font-bold text-white">1</span>
            <h3 class="mt-4 font-bold text-default">Enable Developer mode</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">Open <strong>Settings → Security and login</strong>, then turn on <strong>Developer mode</strong>. If the control is unavailable, ask your workspace administrator about its policy.</p>
          </li>
          <li class="rounded-2xl border border-default bg-elevated p-6">
            <span class="flex size-10 items-center justify-center rounded-xl bg-(--kc-teal) text-lg font-bold text-white">2</span>
            <h3 class="mt-4 font-bold text-default">Add the connection</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">Open <strong>ChatGPT Plugins</strong>, select the plus button, name the connection <strong>KrabiClaw</strong>, describe it as “Manage your KrabiClaw website,” and enter this HTTPS MCP endpoint. Create it and review the discovered tools.</p>
            <div class="mt-4 flex items-center gap-2 rounded-xl border border-default bg-muted/50 px-3 py-2 font-mono text-xs">
              <span class="truncate">https://krabiclaw.com/api/mcp</span>
              <button class="ml-auto cursor-pointer" aria-label="Copy MCP server URL" @click="copyUrl"><PlatformIcon :name="copied ? 'check' : 'clipboard'" class="size-4" /></button>
            </div>
          </li>
          <li class="rounded-2xl border border-default bg-elevated p-6">
            <span class="flex size-10 items-center justify-center rounded-xl bg-(--kc-coral) text-lg font-bold text-white">3</span>
            <h3 class="mt-4 font-bold text-default">Authorize and test</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">Start a new conversation, add KrabiClaw from the tools menu, and complete KrabiClaw OAuth when prompted. Begin with a read-only request before trying a write action.</p>
          </li>
        </ol>

        <div class="mt-10 rounded-2xl border border-default bg-elevated p-6">
          <h3 class="font-bold text-default">Try a safe first request</h3>
          <p class="mt-2 text-sm text-muted">“List my KrabiClaw sites and summarize the homepage of the first one. Do not change anything.”</p>
          <p class="mt-4 text-sm text-muted">ChatGPT sends native attachments to the app when a workflow needs a file. KrabiClaw returns model-readable results and public URLs; it does not simulate a custom file picker.</p>
        </div>

        <div class="mt-6 rounded-2xl border border-default bg-elevated p-6">
          <h3 class="font-bold text-default">Publishing the public plugin</h3>
          <p class="mt-2 text-sm text-muted">Public listing is a separate publisher workflow. Authorized publishers submit KrabiClaw through the OpenAI plugin submission portal; approved releases appear in the Plugins Directory.</p>
        </div>
      </section>
    </main>
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const copied = ref(false)

async function copyUrl() {
  try {
    await navigator.clipboard.writeText('https://krabiclaw.com/api/mcp')
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (error) {
    console.error('Failed to copy MCP server URL', error)
  }
}

useSocialMetadata({
  template: 'platform',
  path: '/plugin',
  title: 'Connect KrabiClaw to ChatGPT',
  description: 'Connect the KrabiClaw custom MCP app to ChatGPT and manage your website through authenticated conversation.',
  schemaPageType: 'SoftwareApplication',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'KrabiClaw for ChatGPT', url: '/plugin' },
  ],
  softwareApplication: { applicationCategory: 'BusinessApplication', operatingSystem: 'Web, ChatGPT' },
})
</script>
