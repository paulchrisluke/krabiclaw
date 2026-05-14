import type { ChowbotMessage, ChowbotToolCall } from './useChowBot'

export interface ChowBotConv {
  id: string
  site_id: string
  title: string
  active_channel: 'dashboard' | 'whatsapp'
  updated_at: string
}

interface StoredMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls: string | null
  status: string
  error: string | null
}

const conversationsState = () => useState<Record<string, ChowBotConv[]>>('chowbot:server-conversations', () => ({}))

export const useChowBotHistory = () => {
  const conversationsBySite = conversationsState()

  const load = async (siteId: string) => {
    const res = await $fetch<{ conversations: ChowBotConv[] }>(`/api/ai/${siteId}/conversations`)
    conversationsBySite.value = {
      ...conversationsBySite.value,
      [siteId]: res.conversations ?? [],
    }
  }

  const forSite = (siteId: string): ChowBotConv[] => conversationsBySite.value[siteId] ?? []

  const get = async (siteId: string, conversationId: string): Promise<{ conversation: ChowBotConv; messages: ChowbotMessage[] }> => {
    const res = await $fetch<{ conversation: ChowBotConv; messages: StoredMessage[] }>(`/api/ai/${siteId}/conversations/${conversationId}`)
    return {
      conversation: res.conversation,
      messages: (res.messages ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content ?? '',
          error: m.status === 'failed' || Boolean(m.error),
          toolCalls: parseToolCalls(m.tool_calls),
        })),
    }
  }

  const remove = async (siteId: string, conversationId: string) => {
    await $fetch(`/api/ai/${siteId}/conversations/${conversationId}`, { method: 'DELETE' })
    await load(siteId)
  }

  return { load, forSite, get, remove }
}

function parseToolCalls(raw: string | null): ChowbotToolCall[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Array<{ name: string; input: ApiValue; result: ApiValue }>
    return parsed.map((tool) => ({ ...tool, status: 'done' as const }))
  } catch {
    return undefined
  }
}
