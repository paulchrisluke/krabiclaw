export type ContentComponentType = 'faq' | 'how_to' | 'ai_assistance'

export interface ContentFaqItem {
  question?: string | null
  answer?: string | null
  position?: number | null
}

export interface ContentHowToStep {
  name?: string | null
  text?: string | null
  url?: string | null
  position?: number | null
}

export interface ContentAiAssistancePrompt {
  title?: string | null
  prompt?: string | null
  description?: string | null
  copy_label?: string | null
  position?: number | null
}

interface ContentComponentBase {
  type: ContentComponentType
  label?: string | null
  status?: 'active' | 'inactive' | null
  render_enabled?: boolean | null
  schema_enabled?: boolean | null
  position?: number | null
}

export interface ContentFaqComponent extends ContentComponentBase {
  type: 'faq'
  data?: {
    items?: ContentFaqItem[] | null
  } | null
}

export interface ContentHowToComponent extends ContentComponentBase {
  type: 'how_to'
  data?: {
    steps?: ContentHowToStep[] | null
    estimated_time?: string | null
    tool_items?: string[] | null
    supply_items?: string[] | null
  } | null
}

export interface ContentAiAssistanceComponent extends ContentComponentBase {
  type: 'ai_assistance'
  data?: {
    intro?: string | null
    collapsed?: boolean | null
    max_visible_lines?: number | null
    prompts?: ContentAiAssistancePrompt[] | null
  } | null
}

export type ContentComponent = ContentFaqComponent | ContentHowToComponent | ContentAiAssistanceComponent
