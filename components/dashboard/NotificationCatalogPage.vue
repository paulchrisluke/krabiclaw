<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <UDashboardPanel v-else id="notification-catalog">
    <template #header>
      <UDashboardNavbar title="Messages" :toggle="false" />
    </template>

    <template #body>
      <!--
        The same hub-and-leaf chain the CMS uses: rows preview what each event
        sends, and one event opens at a time with both channels beside each
        other. Seeing them together is the only way to tell whether they agree.
      -->
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        show-desktop-detail
        wide-detail
        :detail-title="detailTitle"
        :dismiss-to="basePath"
      >
        <template #index>
          <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="error" class="mb-6" />
          <EditorNavigationList :groups="groups" :active-item="openId" />
        </template>

        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'

const basePath = computed(() => '/dev/notifications')
const frame = useEditorFrame(basePath)

const { entries, error } = await useNotificationCatalog()

const groups = computed<EditorNavigationGroup[]>(() => {
  const owner = entries.value.filter(entry => entry.audience === 'owner')
  const guest = entries.value.filter(entry => entry.audience === 'guest')
  const row = (entry: typeof entries.value[number]) => ({
    id: entry.id,
    label: entry.title,
    // What this event actually sends, which is the question the page answers.
    summary: entry.channels.join(' and '),
    to: `${basePath.value}/${entry.id}`,
  })
  return [
    { id: 'owner', label: 'Owner alerts', items: owner.map(row) },
    { id: 'guest', label: 'Guest and account', items: guest.map(row) },
  ].filter(group => group.items.length)
})

const openId = computed(() => frame.childSegment.value ?? entries.value[0]?.id)
const detailTitle = computed(() => entries.value.find(entry => entry.id === openId.value)?.title)

watchEffect(() => {
  const open = frame.childSegment.value
  if (frame.rest.value.length > 1 || (open && entries.value.length && !entries.value.some(entry => entry.id === open))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

useSeoMeta({ title: 'Messages | KrabiClaw', robots: 'noindex, nofollow' })
</script>
