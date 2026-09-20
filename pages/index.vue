<template>
  <NuxtLayout :name="layout">
    <!--
      Every home is its page document, drawn block by block like every other
      page on the site. Each template used to have its own home component that
      composed a fixed list of sections — Saya's read no blocks at all — so the
      one page every visitor lands on was the one page its owner could not edit.
    -->
    <TenantPublicPage :path="homePath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
definePageMeta({ layout: false })

const { isPlatform, siteId } = useTenantSite()
const { template } = usePublicTemplate()
// Where this template keeps its home document. KrabiClaw's own homepage is an
// ordinary published page on the platform site, read by the same loader every
// customer site uses (#903).
const homePath = useTenantPageDocumentPath('home')
const layout = computed(() => template.value!.layout as 'saya' | 'blawby' | 'platform')

if (!isPlatform && !siteId) {
  throw createError({ statusCode: 404, statusMessage: 'Site not found' })
}

// A signed-in owner has no use for the platform's own sales pitch, and showing
// it to them is how a returning owner ends up clicking "Start free" and opening
// a second account. The marketing homepage is for people who do not have an
// account yet; everyone else goes to their dashboard. Anonymous visitors and
// crawlers are untouched, so the cached public page is unchanged.
if (isPlatform && import.meta.client) {
  const session = authClient.useSession()
  watchEffect(() => {
    // `isPending` is not "signed out": redirecting on an unresolved session
    // would bounce every anonymous visitor, and treating it as signed-in would
    // bounce nobody. Only a resolved session with a user redirects.
    if (session.value.isPending) return
    if (session.value.data?.user) navigateTo('/api/post-login', { external: true, redirectCode: 302 })
  })
}
</script>
