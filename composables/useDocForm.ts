import { createEmptyFaqItem, createEmptyHowToStep } from '~/composables/useBlogForm'

export function useDocForm() {
  const form = reactive({
    title: '',
    excerpt: '',
    category: '',
    difficulty_level: '',
    seo_description: '',
    seo_keywords: '',
    canonical_url: '',
    robots: '',
    body: '',
    featured_image_asset_id: '',
    faq_items: [createEmptyFaqItem()],
    how_to_steps: [createEmptyHowToStep(), createEmptyHowToStep()]
  })

  const canSave = computed(() => Boolean(form.title.trim() || form.body.trim()))
  const canPublish = computed(() => Boolean(form.title.trim() && form.body.trim()))

  function handleImageChange(_asset: { id: string; publicUrl: string; thumbnailUrl: string } | null) {
    // Image change is handled by v-model, this is for any additional logic if needed
  }

  return {
    form,
    canSave,
    canPublish,
    handleImageChange
  }
}
