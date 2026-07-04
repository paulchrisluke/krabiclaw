import '#app'

declare module '#app' {
  interface RuntimeConfig {
    wrangler: {
      configPath?: string
      persistDir?: string
      environment?: string
      remoteBindings?: boolean
    }
  }
}
