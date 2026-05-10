import { useChowBotHistory, type ChowBotConv } from './useChowBotHistory'

export interface SidekickMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{ name: string; input: any; result: any }>
  error?: boolean
}

export const useChowBot = () => {
  const isOpen = useState<boolean>('chowbot:open', () => false)
  const messages = useState<SidekickMessage[]>('chowbot:messages', () => [])
  const isLoading = useState<boolean>('chowbot:loading', () => false)
  const conversationId = useState<string | null>('chowbot:convId', () => null)

  const route = useRoute()
  const history = useChowBotHistory()

  const siteId = computed(() => {
    const param = route.params.siteId
    return typeof param === 'string' ? param : null
  })

  const siteRefreshSignal = useState<number>('site:refresh', () => 0)

  const handlePostActionNav = async (toolCalls: any[]) => {
    if (!siteId.value || !toolCalls.length) return
    const names = new Set(toolCalls.map((t: any) => t.name))

    if (names.has('rename_site')) {
      siteRefreshSignal.value++
      return
    }
    if (names.has('create_post') || names.has('publish_post')) {
      await navigateTo(`/dashboard/sites/${siteId.value}/posts`)
      return
    }
    if (names.has('create_location') || names.has('update_location')) {
      await navigateTo(`/dashboard/sites/${siteId.value}/locations`)
      return
    }
    if (names.has('create_menu') || names.has('rename_menu') || names.has('add_menu_item') || names.has('update_menu_item') || names.has('publish_menu')) {
      await navigateTo(`/dashboard/sites/${siteId.value}/menu`)
      return
    }
  }

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

  const loadConversation = (conv: ChowBotConv) => {
    messages.value = [...conv.messages]
    conversationId.value = conv.id
    isOpen.value = true
  }

  const persistConversation = () => {
    if (!siteId.value || !messages.value.length) return
    const userMessages = messages.value.filter(m => m.role === 'user')
    if (!userMessages.length) return

    const id = conversationId.value ?? crypto.randomUUID()
    conversationId.value = id

    history.save({
      id,
      siteId: siteId.value,
      title: (userMessages[0]!.content).slice(0, 45),
      messages: messages.value,
      updatedAt: Date.now(),
    })
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

    messages.value = [...messages.value, { role: 'user', content: text.trim() }]
    isLoading.value = true

    try {
      const history_msgs = messages.value
        .filter(m => !m.error)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await $fetch<{ success: boolean; reply: string; toolCalls: any[] }>(
        `/api/ai/${siteId.value}/agent`,
        {
          method: 'POST',
          body: { messages: history_msgs, currentPage: route.name },
        }
      )

      messages.value = [...messages.value, {
        role: 'assistant',
        content: res.reply,
        toolCalls: res.toolCalls?.length ? res.toolCalls : undefined,
      }]

      persistConversation()
      await handlePostActionNav(res.toolCalls ?? [])
    } catch (err: any) {
      const msg = err?.data?.error ?? 'Something went wrong. Please try again.'
      messages.value = [...messages.value, { role: 'assistant', content: msg, error: true }]
    } finally {
      isLoading.value = false
    }
  }

  return {
    isOpen, messages, isLoading, siteId, conversationId,
    toggle, open, close, sendMessage, clearMessages, startNewConversation, loadConversation,
  }
}
