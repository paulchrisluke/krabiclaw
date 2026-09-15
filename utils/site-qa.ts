// The read-only site Q&A list response.

export interface QaRow {
  id: string
  question: string
  answer: string | null
  status: 'published' | 'hidden'
  sort_order: number
  page_path: string | null
  upvote_count: number | null
}

export const isQaRow = (value: unknown): value is QaRow =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.question === 'string'
  && (value.answer === null || typeof value.answer === 'string')
  && (value.status === 'published' || value.status === 'hidden')
  && typeof value.sort_order === 'number'
  && (value.page_path === null || typeof value.page_path === 'string')
  && (value.upvote_count === null || typeof value.upvote_count === 'number')

export const isQaResponse = (value: unknown): value is { qa: QaRow[] } =>
  isRecord(value) && Array.isArray(value.qa) && value.qa.every(isQaRow)
