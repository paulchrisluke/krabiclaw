<template>
  <AgentSkillsManager
    scope-type="platform"
    endpoint="/api/admin/agent-skills"
    :can-write="true"
    title="Agent Skills"
    description="Manage platform guidance shared by tenant and platform MCP workflows."
  />
</template>

<script setup lang="ts">
import AgentSkillsManager from '~/components/workspace/agent-skills/AgentSkillsManager.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Agent Skills | KrabiClaw', robots: 'noindex, nofollow' })
</script>
