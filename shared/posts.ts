import { calendarDateSchema, preciseTimeSchema, instantSchema, isValidCalendarDate, isValidInstant, instantDate, formatCalendarDate, formatTime, formatTimestamp } from '../utils/timezone.ts'
export const POST_TYPES = ['standard', 'event', 'offer', 'alert'] as const
/** `alert` is not offered when creating: its only alert_type is `covid_19`. An existing alert still opens. */
export const CREATABLE_POST_TYPES = ['standard', 'event', 'offer'] as const
export const POST_ACTIONS = ['book', 'order', 'shop', 'learn_more', 'sign_up', 'call'] as const
export const POST_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
export class PostValidationError extends Error { statusCode = 400 }

const text = { type: 'string' } as const
const nonblank = { type: 'string', minLength: 1 } as const
const date = calendarDateSchema
const time = preciseTimeSchema
const url = { type: 'string', format: 'uri' } as const
const instant = instantSchema
const absent = { type: 'null' } as const
const optionalText = { anyOf: [text, absent] } as const
export const postRecurrenceJsonSchema = { anyOf: [
  { type: 'object', additionalProperties: false, properties: { kind: { enum: ['daily'] }, series_end_time: instant }, required: ['kind'] },
  { type: 'object', additionalProperties: false, properties: { kind: { enum: ['weekly'] }, days_of_week: { type: 'array', items: { enum: POST_WEEKDAYS }, uniqueItems: true }, series_end_time: instant }, required: ['kind', 'days_of_week'] },
  { type: 'object', additionalProperties: false, properties: { kind: { enum: ['monthly'] }, day_of_month: { type: 'integer', minimum: 1, maximum: 31 }, series_end_time: instant }, required: ['kind', 'day_of_month'] },
  { type: 'object', additionalProperties: false, properties: { kind: { enum: ['monthly'] }, day_of_week_occurrence: { enum: ['first', 'second', 'third', 'fourth', 'last'] }, series_end_time: instant }, required: ['kind', 'day_of_week_occurrence'] },
] } as const
export const postEventJsonSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'schedule'], properties: {
    title: nonblank,
    schedule: { type: 'object', additionalProperties: false, properties: { start_date: date, start_time: time, end_date: date, end_time: time }, required: ['start_date', 'start_time', 'end_date', 'end_time'] },
    recurrence_info: postRecurrenceJsonSchema,
  },
} as const
export const postOfferJsonSchema = { type: 'object', additionalProperties: false, properties: { coupon_code: nonblank, redeem_online_url: url, terms_conditions: nonblank } } as const
export const postCallToActionJsonSchema = { anyOf: [
  { type: 'object', additionalProperties: false, properties: { action_type: { enum: ['call'] } }, required: ['action_type'] },
  { type: 'object', additionalProperties: false, properties: { action_type: { enum: ['book', 'order', 'shop', 'learn_more', 'sign_up'] }, url }, required: ['action_type', 'url'] },
] } as const
const nullableAction = { anyOf: [postCallToActionJsonSchema, absent] } as const
const topicRequired = ['post_type', 'event', 'offer', 'call_to_action', 'alert_type'] as const
export const postTopicJsonSchema = { anyOf: [
  { type: 'object', additionalProperties: false, required: topicRequired, properties: { post_type: { enum: ['standard'] }, event: absent, offer: absent, alert_type: absent, call_to_action: nullableAction } },
  { type: 'object', additionalProperties: false, required: topicRequired, properties: { post_type: { enum: ['event'] }, event: postEventJsonSchema, offer: absent, alert_type: absent, call_to_action: nullableAction } },
  { type: 'object', additionalProperties: false, required: topicRequired, properties: { post_type: { enum: ['offer'] }, event: postEventJsonSchema, offer: postOfferJsonSchema, alert_type: absent, call_to_action: absent } },
  { type: 'object', additionalProperties: false, required: topicRequired, properties: { post_type: { enum: ['alert'] }, event: absent, offer: absent, alert_type: { enum: ['covid_19'] }, call_to_action: nullableAction } },
] } as const
export const postMutationJsonSchema = {
  type: 'object', additionalProperties: false, properties: {
    title: optionalText, body: nonblank, slug: optionalText, seo_title: optionalText, seo_description: optionalText,
    location_id: { anyOf: [nonblank, absent] }, scheduled_for: { anyOf: [instant, absent] },
    visibility: { enum: ['public', 'unlisted'] },
    post_type: { enum: POST_TYPES }, event: { anyOf: [postEventJsonSchema, absent] },
    offer: { anyOf: [postOfferJsonSchema, absent] }, call_to_action: nullableAction,
    alert_type: { anyOf: [{ enum: ['covid_19'] }, absent] },
    media: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { asset_id: nonblank, slot: { enum: ['cover', 'gallery'] } }, required: ['asset_id', 'slot'] } },
  },
} as const

type SchemaValue<S> = S extends { readonly anyOf: readonly (infer V)[] } ? SchemaValue<V>
  : S extends { readonly enum: readonly (infer V)[] } ? V
    : S extends { readonly type: 'null' } ? null
      : S extends { readonly type: 'string' } ? string
        : S extends { readonly type: 'integer' } ? number
          : S extends { readonly type: 'array'; readonly items: infer V } ? SchemaValue<V>[]
            : S extends { readonly properties: infer P } ? { -readonly [K in keyof P as K extends (S extends { readonly required: readonly (infer R)[] } ? R : never) ? K : never]: SchemaValue<P[K]> }
              & { -readonly [K in keyof P as K extends (S extends { readonly required: readonly (infer R)[] } ? R : never) ? never : K]?: SchemaValue<P[K]> }
              : never
export type PostTopic = SchemaValue<typeof postTopicJsonSchema>
export type PostEvent = SchemaValue<typeof postEventJsonSchema>
export type PostRecurrence = SchemaValue<typeof postRecurrenceJsonSchema>
export type PostAction = SchemaValue<typeof postCallToActionJsonSchema>
export type PostMutation = SchemaValue<typeof postMutationJsonSchema>

type Schema = { readonly anyOf?: readonly Schema[]; readonly enum?: readonly unknown[]; readonly type?: string; readonly properties?: Readonly<Record<string, Schema>>; readonly required?: readonly string[]; readonly items?: Schema; readonly additionalProperties?: boolean; readonly minimum?: number; readonly maximum?: number; readonly minLength?: number; readonly pattern?: string; readonly format?: string; readonly uniqueItems?: boolean }

function validateShape(schema: Schema, value: unknown, path: string): void {
  const fail = (reason: string): never => { throw new PostValidationError(`${path}: ${reason}`) }
  if (schema.anyOf) {
    for (const candidate of schema.anyOf) {
      try { validateShape(candidate, value, path); return } catch (error) { if (!(error instanceof PostValidationError)) throw error }
    }
    return fail('does not match an allowed shape')
  }
  if (schema.enum) { if (!schema.enum.includes(value)) fail(`must be one of ${schema.enum.join(', ')}`); return }
  if (schema.type === 'null') { if (value !== null) fail('must be null'); return }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return fail('must be a string')
    if (schema.minLength && value.trim().length < schema.minLength) fail('must not be empty')
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('has an invalid format')
    if (schema.format === 'date' && !isValidCalendarDate(value)) fail('must have a real calendar date')
    if (schema.format === 'date-time' && !isValidInstant(value)) fail('must be an RFC 3339 timestamp with an explicit offset')
    if (schema.format === 'uri') {
      try { if (!['http:', 'https:'].includes(new URL(value).protocol)) fail('must use HTTP or HTTPS') } catch { fail('must be an absolute HTTP or HTTPS URL') }
    }
    return
  }
  if (schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) fail('is outside its integer range')
    return
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return fail('must be an array')
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail('must contain unique values')
    if (schema.items) value.forEach((item, index) => validateShape(schema.items!, item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('must be an object')
  const record = value as Record<string, unknown>
  for (const key of schema.required ?? []) if (record[key] === undefined) fail(`${key} is required`)
  for (const [key, item] of Object.entries(record)) {
    const child = schema.properties?.[key]
    if (!child) fail(`unknown field ${key}`)
    if (item !== undefined) validateShape(child!, item, `${path}.${key}`)
  }
}

function parseShape<const S extends Schema>(schema: S, value: unknown): SchemaValue<S> {
  validateShape(schema, value, 'post')
  return value as SchemaValue<S>
}

export function parsePostTopic(input: unknown): PostTopic {
  if (input && typeof input === 'object' && 'post_type' in input) {
    const variant = postTopicJsonSchema.anyOf.find(schema => schema.properties.post_type.enum[0] === input.post_type)
    if (variant) validateShape(variant, input, 'post')
  }
  const topic = parseShape(postTopicJsonSchema, input)
  if (topic.event) {
    const { start_date, start_time, end_date, end_time } = topic.event.schedule
    const precise = (value: string) => { const [whole, fraction = ''] = value.split('.'); return `${whole}.${fraction.padEnd(9, '0')}` }
    if (`${end_date}T${precise(end_time)}` < `${start_date}T${precise(start_time)}`) throw new PostValidationError('event.schedule: end must not precede start')
  }
  return topic
}

export function parsePostInput(input: unknown, existing?: PostTopic & { body: string; scheduled_for?: string | null }) {
  const patch = parseShape(postMutationJsonSchema, input)
  const changedType = patch.post_type !== undefined && patch.post_type !== existing?.post_type
  const post_type = patch.post_type ?? existing?.post_type ?? 'standard'
  const base = changedType || !existing ? { event: null, offer: post_type === 'offer' ? {} : null, call_to_action: null, alert_type: null } : {
    event: existing.event, offer: existing.offer, call_to_action: existing.call_to_action, alert_type: existing.alert_type,
  }
  const topic = parsePostTopic({ ...base, post_type,
    ...Object.fromEntries(Object.entries(patch).filter(([key, value]) => value !== undefined && ['event', 'offer', 'call_to_action', 'alert_type'].includes(key))),
  })
  const body = patch.body ?? existing?.body
  if (typeof body !== 'string' || !body.trim()) throw new PostValidationError('body is required')
  if (patch.scheduled_for && patch.scheduled_for !== existing?.scheduled_for && Date.parse(patch.scheduled_for) <= Date.now()) throw new PostValidationError('scheduled_for must be a future RFC 3339 timestamp')
  if (topic.post_type === 'alert' && patch.media?.length) throw new PostValidationError('Alert posts support only summary and call to action content')
  if (patch.media && patch.media.filter(item => item.slot === 'cover').length > 1) throw new PostValidationError('media accepts at most one cover asset')
  return { ...patch, ...(patch.scheduled_for ? { scheduled_for: instantDate(patch.scheduled_for).toISOString() } : {}), ...topic, body: body.trim() }
}

export function postActionUrl(action: PostAction | null, phone: string | null): string | null {
  if (!action) return null
  return action.action_type === 'call' ? (phone ? `tel:${phone}` : null) : action.url
}

export function postEventDescription(event: PostEvent, locale = 'en'): string {
  const schedule = event.schedule
  const range = `${formatCalendarDate(schedule.start_date, locale)} ${formatTime(schedule.start_time, locale)} – ${formatCalendarDate(schedule.end_date, locale)} ${formatTime(schedule.end_time, locale)}`
  const rule = event.recurrence_info
  if (!rule) return range
  const weekdayName = (day: typeof POST_WEEKDAYS[number]) => formatCalendarDate(`2026-09-${String(6 + POST_WEEKDAYS.indexOf(day)).padStart(2, '0')}`, locale, { weekday: 'long' })
  const startDay = POST_WEEKDAYS[new Date(`${schedule.start_date}T00:00:00Z`).getUTCDay()]!
  const thai = locale.startsWith('th')
  const cadence = rule.kind === 'daily' ? (thai ? 'ทุกวัน' : 'Daily')
    : rule.kind === 'weekly' ? (rule.days_of_week.length ? rule.days_of_week : [startDay]).map(weekdayName).join(', ')
      : 'day_of_month' in rule ? `${thai ? 'ทุกเดือน วันที่' : 'Monthly on day'} ${rule.day_of_month}`
        : `${thai ? 'ทุกเดือน' : 'Monthly'}, ${rule.day_of_week_occurrence} ${weekdayName(startDay)}`
  return `${range} · ${cadence}${rule.series_end_time ? ` · ${thai ? 'ถึง' : 'Until'} ${formatTimestamp(rule.series_end_time, locale, 'UTC')} UTC` : ''}`
}
