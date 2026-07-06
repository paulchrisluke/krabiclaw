<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-5">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-sparkles" class="size-5" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $t('saya.upgrade.pro_feature') }}</p>
              <h2 class="mt-1 text-lg font-semibold text-highlighted">
                {{ featureTitle }}
              </h2>
            </div>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('saya.upgrade.close_modal')"
            @click="close"
          />
        </div>

        <p class="text-sm leading-relaxed text-muted">{{ featureDescription }}</p>

        <ul class="mt-5 space-y-2 text-sm text-default">
          <li v-for="item in featureBullets" :key="item" class="flex gap-2">
            <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{{ item }}</span>
          </li>
        </ul>

        <div class="mt-6">
          <UButton :to="orgSettings.billing.value" color="primary" block @click="close">
            {{ $t('saya.upgrade.get_pro') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { isOpen, feature, close } = useUpgradeModal()
const orgSettings = useOrgSettings()
const { t } = useI18n()

const knownFeatures = [
  'qa-writeback',
  'custom-domain',
  'add-location',
  'connect-gmb',
  'google-business-sync',
  'remove-branding'
]

const featureTitle = computed(() =>
  knownFeatures.includes(feature.value)
    ? t(`saya.upgrade.features.${feature.value}.title`)
    : t('saya.upgrade.pro_feature')
)
const featureDescription = computed(() =>
  knownFeatures.includes(feature.value)
    ? t(`saya.upgrade.features.${feature.value}.description`)
    : t('saya.upgrade.default_description')
)
const featureBullets = computed(() => {
  if (feature.value === 'google-business-sync' || feature.value === 'connect-gmb') {
    return [
      t('saya.upgrade.bullets.gmb_1'),
      t('saya.upgrade.bullets.gmb_2'),
      t('saya.upgrade.bullets.gmb_3')
    ]
  }
  if (feature.value === 'custom-domain') {
    return [
      t('saya.upgrade.bullets.domain_1'),
      t('saya.upgrade.bullets.domain_2'),
      t('saya.upgrade.bullets.domain_3')
    ]
  }
  return [
    t('saya.upgrade.bullets.default_1'),
    t('saya.upgrade.bullets.default_2'),
    t('saya.upgrade.bullets.default_3')
  ]
})
</script>
