import type { SidekickMessage } from './useChowBot'

export interface ChowBotConv {
  id: string
  siteId: string
  title: string
  messages: SidekickMessage[]
  updatedAt: number
}

const STORAGE_KEY = 'chowbot:conversations'
const MAX_STORED = 20

function readStorage(): ChowBotConv[] {
  if (!import.meta.client) return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeStorage(convs: ChowBotConv[]) {
  if (!import.meta.client) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convs))
}

export const useChowBotHistory = () => {
  const save = (conv: ChowBotConv) => {
    const all = readStorage().filter(c => c.id !== conv.id)
    writeStorage([conv, ...all].slice(0, MAX_STORED))
  }

  const remove = (id: string) => {
    writeStorage(readStorage().filter(c => c.id !== id))
  }

  const forSite = (siteId: string): ChowBotConv[] =>
    readStorage().filter(c => c.siteId === siteId).slice(0, 8)

  return { save, remove, forSite }
}
