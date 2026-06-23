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
    how_to_steps: [createEmptyHowToStep(), createEmptyHowToStep()] as BlogHowToStepForm[],
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
