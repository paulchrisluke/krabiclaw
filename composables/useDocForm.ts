import type { BlogEditorBlock } from '~/lib/components/workspace/blog/types'

export interface BlogFaqItemForm {
  question: string
  answer: string
}

export interface BlogHowToStepForm {
  name: string
  text: string
  url: string
}

export function createEmptyFaqItem(): BlogFaqItemForm {
  return { question: '', answer: '' }
}

export function createEmptyHowToStep(): BlogHowToStepForm {
  return { name: '', text: '', url: '' }
}

export function docFormContentBlocks(form: ReturnType<typeof useDocForm>['form']): BlogEditorBlock[] {
  // Generated ids are written back onto the form so a second call before the
  // next save/hydrate round-trip (e.g. a client-side-validation retry) reuses
  // the same block id instead of minting a new one and orphaning the first.
  form.markdown_block_id ||= crypto.randomUUID()
  const blocks: BlogEditorBlock[] = [{ id: form.markdown_block_id, type: 'markdown', position: 0, parent_block_id: null, level: null, data: { markdown: form.body, editor_mode: 'source' }, media: [] }]
  const faqItems = form.faq_items.map(item => ({ question: item.question.trim(), answer: item.answer.trim() })).filter(item => item.question && item.answer)
  if (faqItems.length) {
    form.faq_block_id ||= crypto.randomUUID()
    blocks.push({ id: form.faq_block_id, type: 'faq', position: blocks.length, parent_block_id: null, level: null, data: { items: faqItems, label: form.faq_label, status: form.faq_status, render_enabled: form.faq_render_enabled, schema_enabled: form.faq_schema_enabled }, media: [] })
  }
  const steps = form.how_to_steps.map(step => ({ name: step.name.trim(), text: step.text.trim(), url: step.url.trim() || null })).filter(step => step.name && step.text)
  if (steps.length) {
    form.how_to_block_id ||= crypto.randomUUID()
    blocks.push({ id: form.how_to_block_id, type: 'how_to', position: blocks.length, parent_block_id: null, level: null, data: { steps, label: form.how_to_label, status: form.how_to_status, render_enabled: form.how_to_render_enabled, schema_enabled: form.how_to_schema_enabled }, media: [] })
  }
  return blocks
}

export function hydrateDocFormContent(form: ReturnType<typeof useDocForm>['form'], blocks: BlogEditorBlock[]) {
  form.markdown_block_id = blocks.find(block => block.type === 'markdown')?.id || ''
  form.body = blocks.filter(block => block.type === 'markdown').map(block => String(block.data.markdown || '')).join('\n\n')
  const faq = blocks.find(block => block.type === 'faq')
  form.faq_block_id = faq?.id || ''
  form.faq_label = faq?.data.label ? String(faq.data.label) : ''
  form.faq_status = faq?.data.status === 'inactive' ? 'inactive' : 'active'
  form.faq_render_enabled = faq?.data.render_enabled !== false
  form.faq_schema_enabled = faq?.data.schema_enabled !== false
  form.faq_items = Array.isArray(faq?.data.items) ? faq.data.items.map(item => ({ question: String(item.question), answer: String(item.answer) })) : []
  const howTo = blocks.find(block => block.type === 'how_to')
  form.how_to_block_id = howTo?.id || ''
  form.how_to_label = howTo?.data.label ? String(howTo.data.label) : ''
  form.how_to_status = howTo?.data.status === 'inactive' ? 'inactive' : 'active'
  form.how_to_render_enabled = howTo?.data.render_enabled !== false
  form.how_to_schema_enabled = howTo?.data.schema_enabled !== false
  form.how_to_steps = Array.isArray(howTo?.data.steps) ? howTo.data.steps.map(step => ({ name: String(step.name), text: String(step.text), url: step.url == null ? '' : String(step.url) })) : []
}

export function useDocForm() {
  const form = reactive({
    title: '',
    excerpt: '',
    category: '',
    nav_section: '',
    nav_title: '',
    nav_order: null as number | null,
    nav_section_order: null as number | null,
    hide_from_nav: false,
    featured_order: null as number | null,
    difficulty_level: '',
    seo_description: '',
    seo_keywords: '',
    canonical_url: '',
    robots: '',
    body: '',
    markdown_block_id: '',
    faq_block_id: '',
    how_to_block_id: '',
    media: [] as Array<{ asset_id: string; slot: string }>,
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
  const featuredAssetId = computed({
    get: () => form.media.find(item => item.slot === 'featured')?.asset_id ?? '',
    set: (assetId: string | null) => {
      form.media = [
        ...(assetId ? [{ asset_id: assetId, slot: 'featured' }] : []),
        ...form.media.filter(item => item.slot !== 'featured'),
      ]
    },
  })

  return {
    form,
    canSave,
    canPublish,
    featuredAssetId,
  }
}
