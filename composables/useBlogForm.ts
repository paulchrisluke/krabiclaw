export interface BlogFaqItemForm {
  question: string
  answer: string
}

export interface BlogHowToStepForm {
  name: string
  text: string
  image_asset_id: string
  url: string
}

export function createEmptyFaqItem(): BlogFaqItemForm {
  return {
    question: '',
    answer: '',
  }
}

export function createEmptyHowToStep(): BlogHowToStepForm {
  return {
    name: '',
    text: '',
    image_asset_id: '',
    url: '',
  }
}

export function useBlogForm() {
  const form = reactive({
    title: '',
    excerpt: '',
    category: '',
    seo_description: '',
    seo_keywords: '',
    canonical_url: '',
    robots: '',
    body: '',
    featured_image_asset_id: '',
    faq_items: [createEmptyFaqItem()] as BlogFaqItemForm[],
    faq_label: '',
    faq_status: 'active' as 'active' | 'inactive',
    faq_render_enabled: true,
    faq_schema_enabled: true,
    how_to_steps: [createEmptyHowToStep(), createEmptyHowToStep()] as BlogHowToStepForm[],
    how_to_label: '',
    how_to_status: 'active' as 'active' | 'inactive',
    how_to_render_enabled: true,
    how_to_schema_enabled: true,
  })

  const canSave = computed(() => Boolean(form.title.trim() || form.body.trim()))
  const canPublish = computed(() => Boolean(form.title.trim() && form.body.trim()))

  function handleImageChange(_asset: { id: string; publicUrl: string; thumbnailUrl: string } | null) {
  }

  return {
    form,
    canSave,
    canPublish,
    handleImageChange,
  }
}
