<template>
  <AgentSkillsManager
    v-if="organizationId"
    scope-type="organization"
    :endpoint="`/api/organizations/${encodeURIComponent(organizationId)}/agent-skills`"
    :organization-id="organizationId"
    :can-write="true"
    title="Organization Agent Skills"
    description="Manage guidance inherited by every site in this organization."
  />
</template>

<script setup lang="ts">
import AgentSkillsManager from '~/components/workspace/agent-skills/AgentSkillsManager.vue'

definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardSite()
await dashboard.refresh()
const organizationId = computed(() => dashboard.organization.value?.id ?? null)
if (!organizationId.value) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
if (!['owner', 'admin'].includes(dashboard.organization.value?.role ?? '')) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useSeoMeta({ title: 'Organization Agent Skills | KrabiClaw', robots: 'noindex, nofollow' })
</script>
