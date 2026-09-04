<template>
  <UDashboardPanel id="location-experience-new">
    <template #header>
      <UDashboardNavbar title="New experience" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="experiencesPath" label="Experiences" />
        </template>
        <template #right>
          <UButton :loading="editor.saving.value" :disabled="!editor.form.title.trim()" label="Create" @click="onSave" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!--
        Creating asks only for what names the experience. Photos, pricing, slots,
        policy and translations each need a saved id anyway, so they are sections
        of the experience once it exists rather than a wall of fields up front.
      -->
      <div class="mx-auto w-full max-w-xl space-y-6">
        <UFormField label="Title" required>
          <UInput v-model="editor.form.title" size="xl" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Tagline" help="One-line hook shown on the listing card.">
          <UInput v-model="editor.form.tagline" size="xl" class="w-full" />
        </UFormField>
        <UFormField label="Description">
          <UTextarea v-model="editor.form.body" :rows="6" class="w-full" />
        </UFormField>
        <!--
          Photos, pricing, times, policy and translations all need a saved id,
          so they are sections of the experience rather than a wall of fields
          before it exists. Naming them here means Create is not a leap.
        -->
        <div class="rounded-xl border border-default p-4">
          <p class="text-sm font-medium text-highlighted">After you create it</p>
          <p class="mt-1 text-sm text-muted">
            You'll land on this experience's own page, where photos, pricing, duration and
            capacity, time slots, its booking policy and translations are each a section you
            can fill in. It goes on your site straight away — set its status to Inactive
            under Details if you'd rather finish it first.
          </p>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useExperienceEditor } from '~/composables/useExperienceEditor'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.experiences' })

const { locationPaths } = useDashboardSiteLinks()
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const experiencesPath = computed(() => locationPaths.value?.experiences ?? '')
const defaultCurrency = computed(() => dashboard.site.value?.default_currency || 'USD')

const editor = useExperienceEditor(siteId, currentLocationId, defaultCurrency)
editor.reset()

async function onSave() {
  const experience = await editor.save(null)
  if (experience?.id) await navigateTo(`${experiencesPath.value}/${experience.id}`)
}

useSeoMeta({ title: 'New experience | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
