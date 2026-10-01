<template>
  <!--
    The announcement as an index: whether it shows, then its headline,
    message, button and image, each previewing its value and opening its own
    leaf. Seven controls in one pane was a form, not a leaf (DESIGN.md).
  -->
  <DashboardIndexPanel id="organization-announcement" title="Announcement" :auto-open="groups[0]?.items[0]?.to ?? null">
    <EditorNavigationList :groups="groups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { organizationSettingsEditorKey } from '~/lib/components/workspace/settings/OrganizationSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })

const editor = inject(organizationSettingsEditorKey)!
const level = useRouteLevel()
const to = (segment: string) => `${level.path.value}/${segment}`

const groups = computed<EditorNavigationGroup[]>(() => {
  const form = editor.form
  const button = form.announcementCtaLabel.trim() ? `${form.announcementCtaLabel} · ${form.announcementCtaUrl}` : ''
  return [
    { id: 'visibility', items: [{ id: 'visibility', label: 'Show announcement', summary: form.announcementEnabled ? (form.announcementDismissible ? 'On · visitors can dismiss it' : 'On') : 'Off', to: to('visibility') }] },
    {
      id: 'content',
      items: [
        { id: 'headline', label: 'Headline', summary: form.announcementHeadline || 'No headline', placeholder: !form.announcementHeadline, to: to('headline') },
        { id: 'message', label: 'Message', summary: form.announcementDescription || 'No message', placeholder: !form.announcementDescription, to: to('message') },
        { id: 'button', label: 'Button', summary: button || 'No button', placeholder: !button, to: to('button') },
        { id: 'image', label: 'Image', summary: form.announcementAssetId ? 'Image chosen' : 'No image', placeholder: !form.announcementAssetId, to: to('image') },
      ],
    },
  ]
})
</script>
