import type { BlawbyRouteRecipe } from '~/types/blawby'
import { useBlawbyDocument } from '~/composables/useBlawbyDocument'

export async function useBlawbyRoute(recipe: BlawbyRouteRecipe, slug?: string | null) {
  const asyncData = await useBlawbyDocument(recipe, slug)

  return {
    ...asyncData,
    data: computed(() => asyncData.data.value.route),
  }
}
