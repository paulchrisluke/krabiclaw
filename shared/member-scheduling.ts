export interface WorkingHours { weekday: number; start: string; end: string }
export interface SchedulingInterval { start: string; end: string }
export interface PublicProvider { name: string; photo_url: string | null; bio: string | null }
export const MEMBER_BUSY_SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.freebusy'] as const
export const BUSY_FRESHNESS_MS = 120_000
