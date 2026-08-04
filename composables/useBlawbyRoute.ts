import type { BlawbyRouteRecipe } from '~/types/blawby'
import { useBlawbyDocument } from '~/composables/useBlawbyDocument'

export async function useBlawbyRoute(
  recipe: BlawbyRouteRecipe,
  slug?: string | null,
  options: { server?: boolean; lazy?: boolean } = {},
) {
  const asyncData = await useBlawbyDocument(recipe, slug, options)

  return {
    ...asyncData,
    data: computed(() => asyncData.data.value?.route ?? null),
  }
}
