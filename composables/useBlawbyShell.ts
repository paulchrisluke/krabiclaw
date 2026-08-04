import { resolveBlawbyRouteTarget, useBlawbyDocument } from '~/composables/useBlawbyDocument'

export async function useBlawbyShell() {
  const route = useRoute()
  const target = resolveBlawbyRouteTarget(route.path, route.params)
  const asyncData = await useBlawbyDocument(target.recipe, target.slug)
  const data = computed(() => asyncData.data.value.shell)
  return {
    ...asyncData,
    data,
    identity: computed(() => data.value.identity),
    navigation: computed(() => data.value.navigation),
    consultation: computed(() => data.value.consultation),
    compliance: computed(() => data.value.compliance),
    themeTokens: computed(() => data.value.themeTokens),
    offeringLinks: computed(() => data.value.offeringLinks),
  }
}
