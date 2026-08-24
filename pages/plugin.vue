<template>
  <NuxtLayout name="platform">
    <main class="min-h-screen bg-default pb-24">
      <section class="mx-auto max-w-5xl px-4 pt-20 sm:px-6">
        <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-6">
            <img src="/platform/web-app-manifest-192x192.png" alt="KrabiClaw app icon" class="size-24 rounded-[28px] border border-default shadow-lg">
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
            <p class="text-sm leading-relaxed text-muted">Attach a photo or video in ChatGPT, then ask KrabiClaw to upload and place it. There is no separate upload widget.</p>
          </UCard>
          <UCard>
            <template #header><h2 class="text-lg font-bold">Keep control</h2></template>
            <p class="text-sm leading-relaxed text-muted">OAuth limits access to sites you can manage. Publishing and destructive actions are identified in the app's tool metadata.</p>
          </UCard>
        </div>
      </section>

      <section class="mx-auto mt-20 max-w-4xl border-t border-default px-4 pt-14 sm:px-6">
        <h2 class="text-3xl font-extrabold text-default">Connect in ChatGPT</h2>
        <p class="mt-3 text-muted">Custom MCP apps with write actions are available on ChatGPT web for Business and Enterprise/Edu workspaces. Workspace role and policy determine who can create and use them.</p>

        <ol class="mt-10 grid gap-6 md:grid-cols-3">
          <li class="rounded-2xl border border-default bg-elevated p-6">
            <span class="flex size-10 items-center justify-center rounded-xl bg-(--kc-navy) text-lg font-bold text-white">1</span>
            <h3 class="mt-4 font-bold text-default">Enable developer access</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted"><strong>Business:</strong> a workspace admin or owner enables Developer mode, creates and tests the app, and publishes it to the workspace. <strong>Enterprise/Edu:</strong> an admin grants Developer mode through RBAC and controls access to the published app; enabled members can then turn on Developer mode in their user settings and test apps.</p>
          </li>
          <li class="rounded-2xl border border-default bg-elevated p-6">
            <span class="flex size-10 items-center justify-center rounded-xl bg-(--kc-teal) text-lg font-bold text-white">2</span>
            <h3 class="mt-4 font-bold text-default">Create the custom app</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">Open <strong>Workspace Settings → Apps → Create</strong>, name the app KrabiClaw, describe its website-management purpose, and enter this HTTPS MCP endpoint.</p>
            <div class="mt-4 flex items-center gap-2 rounded-xl border border-default bg-muted/50 px-3 py-2 font-mono text-xs">
              <span class="truncate">https://krabiclaw.com/api/mcp</span>
              <button class="ml-auto cursor-pointer" aria-label="Copy MCP server URL" @click="copyUrl"><PlatformIcon :name="copied ? 'check' : 'clipboard'" class="size-4" /></button>
            </div>
          </li>
          <li class="rounded-2xl border border-default bg-elevated p-6">
            <span class="flex size-10 items-center justify-center rounded-xl bg-(--kc-coral) text-lg font-bold text-white">3</span>
            <h3 class="mt-4 font-bold text-default">Authorize and test</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted">A workspace admin or owner reviews the discovered tools and publishes the app to permitted users. Those users can then connect, sign in through KrabiClaw OAuth, and select KrabiClaw from Apps in a new conversation.</p>
          </li>
        </ol>

        <div class="mt-10 rounded-2xl border border-default bg-elevated p-6">
          <h3 class="font-bold text-default">Try a safe first request</h3>
          <p class="mt-2 text-sm text-muted">“List my KrabiClaw sites and summarize the homepage of the first one. Do not change anything.”</p>
          <p class="mt-4 text-sm text-muted">ChatGPT sends native attachments to the app when a workflow needs a file. KrabiClaw returns model-readable results and public URLs; it does not simulate a custom file picker.</p>
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
