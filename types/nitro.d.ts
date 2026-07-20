import 'nitropack'

declare module 'nitropack' {
  interface NitroConfig {
    cloudflareDev?: {
      configPath?: string
      persistDir?: string
      envFiles?: string[]
      silent?: boolean
      environment?: string
    }
  }
}
