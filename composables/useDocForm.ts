import { createEmptyFaqItem, createEmptyHowToStep } from '~/composables/useBlogForm'

export function useDocForm() {
  const form = reactive({
    title: '',
    excerpt: '',
    category: '',
    nav_section: '',
    nav_title: '',
    nav_order: '',
    nav_section_order: '',
    hide_from_nav: false,
    featured_order: '',
    difficulty_level: '',
    seo_description: '',
    seo_keywords: '',
    canonical_url: '',
    robots: '',
    body: '',
    featured_image_asset_id: '',
    faq_items: [createEmptyFaqItem()],
    faq_label: '',
    faq_status: 'active' as 'active' | 'inactive',
    faq_render_enabled: true,
    faq_schema_enabled: true,
    how_to_steps: [createEmptyHowToStep(), createEmptyHowToStep()],
    how_to_label: '',
    how_to_status: 'active' as 'active' | 'inactive',
    how_to_render_enabled: true,
    how_to_schema_enabled: true,
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
