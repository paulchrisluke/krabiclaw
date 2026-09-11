<template>
  <OnboardingStepScreen v-if="step" :step="step" @advance="advance" />
</template>

<script setup lang="ts">
import OnboardingStepScreen from '~/lib/components/workspace/onboarding/OnboardingStepScreen.vue'
import { onboardingStep, onboardingStepPath, useOnboardingSteps } from '~/composables/useOnboardingFlow'

definePageMeta({ layout: 'dashboard', skipDashboardContext: true })

const route = useRoute()
const router = useRouter()
const { nextOf } = useOnboardingSteps()
const step = computed(() => onboardingStep(String(route.params.step ?? ''), 'new-site'))

async function advance() {
  const target = step.value ? nextOf(step.value.id) : null
  if (target) await router.push(onboardingStepPath(target.id))
}
</script>
