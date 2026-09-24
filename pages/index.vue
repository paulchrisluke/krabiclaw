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

const { isPlatform, organizationId } = useTenantOrganization()
const { template } = usePublicTemplate()
// Where this template keeps its home document. KrabiClaw's own homepage is an
// ordinary published page on the platform site, read by the same loader every
// customer site uses (#903).
const homePath = useTenantPageDocumentPath('home')
const layout = computed(() => template.value!.layout as 'saya' | 'blawby' | 'platform')

if (!isPlatform && !organizationId) {
  throw createError({ statusCode: 404, statusMessage: 'Site not found' })
}

// A signed-in owner has no use for the platform's own sales pitch, and showing
// it to them is how a returning owner ends up clicking "Start free" and opening
// a second account. The marketing homepage is for people who do not have an
// account yet; everyone else goes to their dashboard. Anonymous visitors and
// crawlers are untouched, so the cached public page is unchanged: a request
// carrying a session cookie bypasses the edge cache (00.edge-cache.ts).
// Better Auth's Nuxt session read runs through useFetch, so the server answers
// a hard load with the 302 and the client covers in-app navigation to `/`.
if (isPlatform) {
  const { data: session } = await authClient.useSession(useFetch)
  if (session.value?.user) await navigateTo('/api/post-login', { external: true, redirectCode: 302 })
}
</script>
