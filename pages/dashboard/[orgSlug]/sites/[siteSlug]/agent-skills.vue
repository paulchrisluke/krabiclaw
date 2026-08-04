<template>
  <AgentSkillsManager
    v-if="siteId"
    scope-type="site"
    :endpoint="`/api/sites/${encodeURIComponent(siteId)}/agent-skills`"
    :organization-id="organizationId"
    :site-id="siteId"
    :can-write="canWrite"
    title="Site Agent Skills"
    description="Manage site-specific guidance layered on top of platform and organization skills."
  />
</template>

<script setup lang="ts">
import AgentSkillsManager from '~/components/workspace/agent-skills/AgentSkillsManager.vue'

definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardSite()
await dashboard.refresh()
const siteId = computed(() => dashboard.siteId.value ?? null)
const organizationId = computed(() => dashboard.site.value?.organization_id ?? dashboard.organization.value?.id ?? null)
const canWrite = computed(() => dashboard.siteAccess.value === 'organization' || dashboard.siteAccess.value === 'site')
if (!siteId.value) throw createError({ statusCode: 404, statusMessage: 'Site not found' })

useSeoMeta({ title: 'Site Agent Skills | KrabiClaw', robots: 'noindex, nofollow' })
</script>
