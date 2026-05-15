import { useChowBotHistory, type ChowBotConv } from './useChowBotHistory'

const MENU_TOOLS = new Set(['create_menu', 'rename_menu', 'rename_menu_section', 'delete_menu_section', 'add_menu_item', 'update_menu_item', 'delete_menu_item', 'sync_menu_items', 'publish_menu', 'add_menu_items_batch', 'delete_menu', 'set_default_currency'])

export interface ChowbotToolCall {
  name: string
  input: ApiValue
  result: ApiValue
  status: 'running' | 'done'
}

export interface ChowbotMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ChowbotToolCall[]
  error?: boolean
  streaming?: boolean
}

export const useChowBot = () => {
  const isOpen = useState<boolean>('chowbot:open', () => false)
  const messages = useState<ChowbotMessage[]>('chowbot:messages', () => [])
  const isLoading = useState<boolean>('chowbot:loading', () => false)
  const conversationId = useState<string | null>('chowbot:convId', () => null)
  // Pages can override the currentPage sent to the agent (e.g. 'onboarding')
  const currentPageOverride = useState<string | null>('chowbot:currentPageOverride', () => null)

  const route = useRoute()
  const history = useChowBotHistory()

  const siteId = computed(() => {
    const param = route.params.siteId
    return typeof param === 'string' ? param : null
  })

  const locationId = computed(() => {
    const param = route.query.locationId
    return typeof param === 'string' ? param : null
  })

  const { update: updateCredits } = useAiCredits(siteId)

  const toggle = () => { isOpen.value = !isOpen.value }
  const open = () => { isOpen.value = true }
  const close = () => { isOpen.value = false }

  const clearMessages = () => {
    messages.value = []
    conversationId.value = null
  }

  const startNewConversation = () => {
    clearMessages()
    isOpen.value = true
  }

  const loadConversation = async (conv: ChowBotConv) => {
    if (!siteId.value) return

    try {
      const loaded = await history.get(siteId.value, conv.id)
      if (!Array.isArray(loaded.messages) || !loaded.conversation?.id) return

      messages.value = [...loaded.messages]
      conversationId.value = loaded.conversation.id
      isOpen.value = true
    } catch (error) {
      console.error('[ChowBot] loadConversation error:', error)
    }
  }

  const handlePostActionNav = async (toolCalls: ChowbotToolCall[]) => {
    if (!siteId.value || !toolCalls.length) return
    const names = new Set(toolCalls.map(t => t.name))

    if (names.has('rename_site') || names.has('set_default_currency')) {
      useState<number>('site:refresh').value++
    }

    if ([...names].some(n => MENU_TOOLS.has(n))) {
      useState<number>('menu:refresh', () => 0).value++
    }

    // Keep panel open across navigation — set isLoading briefly as a guard
    // so the overlay @click doesn't fire during the route transition
    let target = ''
    if (names.has('create_post') || names.has('publish_post')) {
      target = `/dashboard/sites/${siteId.value}/posts`
    } else if (names.has('create_location') || names.has('update_location')) {
      target = `/dashboard/sites/${siteId.value}/locations`
    } else if ([...names].some(n => MENU_TOOLS.has(n))) {
      const locId = locationId.value
      target = `/dashboard/sites/${siteId.value}/menu${locId ? `?locationId=${encodeURIComponent(locId)}` : ''}`
    }

    if (target) {
      isLoading.value = true  // prevent overlay close during transition
      await navigateTo(target)
      isLoading.value = false
    }
  }

  // Replace the last message in the array (the streaming placeholder)
  const updateLastMessage = (patch: Partial<ChowbotMessage>) => {
    const arr = messages.value
    if (!arr.length) return
    messages.value = [
      ...arr.slice(0, -1),
      { ...arr[arr.length - 1]!, ...patch },
    ]
  }

  const addToolToLast = (tool: ChowbotToolCall) => {
    const arr = messages.value
    if (!arr.length) return
    const last = arr[arr.length - 1]!
    messages.value = [
      ...arr.slice(0, -1),
      { ...last, toolCalls: [...(last.toolCalls ?? []), tool] },
    ]
  }

  const markToolDone = (name: string) => {
    const arr = messages.value
    if (!arr.length) return
    const last = arr[arr.length - 1]!
    // Mark the most recent 'running' tool with this name as done
    let marked = false
    const updated = (last.toolCalls ?? []).map(t => {
      if (!marked && t.name === name && t.status === 'running') {
        marked = true
        return { ...t, status: 'done' as const }
      }
      return t
    })
    messages.value = [...arr.slice(0, -1), { ...last, toolCalls: updated }]
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading.value) return

    if (!siteId.value) {
      messages.value = [...messages.value, {
        role: 'assistant',
        content: 'Navigate to a site to use ChowBot.',
      }]
      return
    }

    // Add user message + streaming placeholder first, then build history
    // (history must include the current user message or the first request sends an empty array)
    messages.value = [
      ...messages.value,
      { role: 'user', content: text.trim() },
      { role: 'assistant', content: '', toolCalls: [], streaming: true },
    ]
    isLoading.value = true

    try {
      const response = await fetch(`/api/ai/${siteId.value}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId.value,
          message: text.trim(),
          currentPage: currentPageOverride.value ?? route.name,
          locationId: locationId.value,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error ?? `Error ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // SSE lines are separated by \n\n
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          let ev: ApiRecord
          try {
            ev = JSON.parse(line.slice(6)) as ApiRecord
          } catch (parseErr) {
            console.error('[ChowBot] SSE parse error:', parseErr)
            continue
          }

          try {
            if (ev.type === 'tool_start') {
              addToolToLast({ name: String(ev.name ?? ''), input: {}, result: null, status: 'running' })
            }

            if (ev.type === 'tool_done') {
              markToolDone(String(ev.name ?? ''))
            }

            if (ev.type === 'text') {
              updateLastMessage({ content: String(ev.content ?? '') })
            }

            if (ev.type === 'done') {
              if (typeof ev.conversationId === 'string') conversationId.value = ev.conversationId
              const toolCalls = Array.isArray(ev.toolCalls) ? ev.toolCalls as ChowbotToolCall[] : []
              updateLastMessage({ toolCalls, streaming: false })
              updateCredits(typeof ev.creditsRemaining === 'number' ? ev.creditsRemaining : null)
              if (siteId.value) await history.load(siteId.value)
              await handlePostActionNav(toolCalls)
            }

            if (ev.type === 'error') {
              updateLastMessage({ content: String(ev.message ?? 'Something went wrong.'), error: true, streaming: false })
            }
          } catch (eventErr) {
            console.error('[ChowBot] SSE event handling error:', eventErr)
          }
        }
      }
    } catch (err) {
      console.error('[ChowBot] sendMessage error:', err)
      updateLastMessage({ content: err instanceof Error ? err.message : 'Something went wrong. Please try again.', error: true, streaming: false })
    } finally {
      isLoading.value = false
    }
  }

  return {
    isOpen, messages, isLoading, siteId, conversationId, currentPageOverride,
    toggle, open, close, sendMessage, clearMessages, startNewConversation, loadConversation,
  }
}
