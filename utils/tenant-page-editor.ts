import {
  TENANT_PAGE_BLOCK_REGISTRY,
  normalizeTenantPageBlocks,
  type TenantPageBlock,
  type TenantPageBlockType,
} from './tenant-page-blocks'

type EditorData = Record<string, unknown>

export function createTenantPageEditorData(type: TenantPageBlockType): EditorData {
  switch (type) {
    case 'heading':
      return { text: '', level: 2 }
    case 'markdown':
      return { markdown: '', editor_mode: 'rich' }
    case 'image':
      return { alt: '', caption: '' }
    case 'gallery':
      return {}
    case 'faq':
      return { title: '', items: [{ title: '', description: '' }] }
    case 'divider':
      return {}
    case 'cta':
    case 'contact_cta':
    case 'booking_cta':
      return { title: '', description: '', label: '', url: '' }
    case 'callout':
      return { title: '', body: '', tone: 'neutral', buttons: [] }
    case 'hero':
      return { eyebrow: '', title: '', subtitle: '', alt: '', cta_label: '', cta_url: '' }
    case 'button_group':
      return { buttons: [{ label: '', url: '' }] }
    case 'feature_grid':
    case 'testimonial_grid':
    case 'offering_grid':
    case 'location_grid':
      return { title: '', source: 'manual', items: [] }
    case 'donation_choices':
      return { title: '', description: '', destination: '', tiers: [{ amount: '', title: '', description: '' }] }
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function objectArray(data: EditorData, key: string): Array<Record<string, unknown>> {
  const value = data[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
}

function stringArray(data: EditorData, key: string): string[] {
  const value = data[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
}

function itemText(item: Record<string, unknown>, key: string, aliases: string[] = []): string {
  for (const candidate of [key, ...aliases]) {
    const value = text(item[candidate])
    if (value) return value
  }
  return ''
}

function addError(errors: string[], message: string) {
  if (!errors.includes(message)) errors.push(message)
}

function validateButtons(errors: string[], data: EditorData, label: string) {
  const buttons = objectArray(data, 'buttons')
  buttons.forEach((button, index) => {
    const buttonLabel = itemText(button, 'label')
    const url = itemText(button, 'url')
    if (!buttonLabel && !url) addError(errors, `${label} ${index + 1} needs a label or URL.`)
    if (buttonLabel && !url) addError(errors, `${label} ${index + 1} needs a URL.`)
    if (url && !buttonLabel) addError(errors, `${label} ${index + 1} needs a label.`)
  })
}

function validateGridItems(errors: string[], data: EditorData, label = 'Item') {
  const items = objectArray(data, 'items')
  items.forEach((item, index) => {
    if (!itemText(item, 'title', ['name'])) addError(errors, `${label} ${index + 1} needs a title.`)
  })
}

export function validateTenantPageBlock(block: TenantPageBlock): string[] {
  const errors: string[] = []
  const definition = TENANT_PAGE_BLOCK_REGISTRY[block.type]
  if (!definition) return [`${String(block.type)} is not a registered block type.`]

  try {
    normalizeTenantPageBlocks([block])
  } catch (error) {
    addError(errors, error instanceof Error ? error.message.replace(/^blocks\[0\]\.?/, '') : 'Block data is invalid.')
  }

  const data = block.data
  switch (block.type) {
    case 'heading':
      if (!text(data.text)) addError(errors, 'Heading text is required.')
      break
    case 'markdown':
      if (!text(data.markdown)) addError(errors, 'Rich text is empty.')
      break
    case 'image':
      if (!block.media.some(item => item.slot === 'media')) addError(errors, 'Select a media asset.')
      break
    case 'gallery':
      if (!block.media.some(item => item.slot === 'gallery')) addError(errors, 'Add at least one gallery image.')
      break
    case 'faq':
      if (text(data.source) === 'page_qa') break
      objectArray(data, 'items').forEach((item, index) => {
        if (!itemText(item, 'title', ['question'])) addError(errors, `FAQ item ${index + 1} needs a question.`)
        if (!itemText(item, 'description', ['answer'])) addError(errors, `FAQ item ${index + 1} needs an answer.`)
      })
      break
    case 'cta':
    case 'contact_cta':
    case 'booking_cta':
      if (Boolean(text(data.label)) !== Boolean(text(data.url))) addError(errors, 'CTA label and URL must be provided together.')
      break
    case 'callout':
      validateButtons(errors, data, 'Callout button')
      break
    case 'hero':
      if (Boolean(text(data.cta_label)) !== Boolean(text(data.cta_url))) addError(errors, 'Hero CTA label and URL must be provided together.')
      break
    case 'button_group':
      validateButtons(errors, data, 'Button')
      break
    case 'feature_grid':
    case 'testimonial_grid':
    case 'offering_grid':
    case 'location_grid':
      if (text(data.source) !== 'site_posts' && text(data.source) !== 'site_reviews' && text(data.source) !== 'site_offerings' && text(data.source) !== 'calculator') {
        validateGridItems(errors, data, 'Grid item')
      }
      if (block.type === 'offering_grid' && text(data.source) === 'site_offerings') break
      if (block.type === 'location_grid' && !stringArray(data, 'location_ids').length && !objectArray(data, 'items').length) addError(errors, 'Add at least one location reference or manual item.')
      break
    case 'donation_choices':
      if (!text(data.destination)) addError(errors, 'Donation destination is required.')
      objectArray(data, 'tiers').forEach((item, index) => {
        if (!itemText(item, 'amount')) addError(errors, `Donation tier ${index + 1} needs an amount.`)
        if (!itemText(item, 'title')) addError(errors, `Donation tier ${index + 1} needs a title.`)
      })
      break
    case 'divider':
      break
  }

  return errors
}

export function tenantPageBlockSummary(block: TenantPageBlock): string {
  const data = block.data
  const summary = [data.title, data.text, data.eyebrow, data.markdown, data.description]
    .find(value => text(value))
  if (summary) return text(summary).slice(0, 120)
  return TENANT_PAGE_BLOCK_REGISTRY[block.type]?.label ?? 'Block'
}
