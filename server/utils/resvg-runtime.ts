import { initWasm, type InitInput } from '@resvg/resvg-wasm'

let resvgInit: Promise<void> | null = null

export async function loadLocalWasmModule(specifier: string): Promise<WebAssembly.Module> {
  if (!import.meta.dev) throw new Error('Local WASM loading is only available in development')
  const [{ readFile }, { createRequire }] = await Promise.all([
    import('node:fs/promises'),
    import('node:module'),
  ])
  const bytes = await readFile(createRequire(import.meta.url).resolve(specifier))
  return await WebAssembly.compile(bytes)
}

async function loadBundledResvgWasm(): Promise<WebAssembly.Module> {
  if (import.meta.dev) return await loadLocalWasmModule('@resvg/resvg-wasm/index_bg.wasm')
  const { default: wasmModule } = await import('@resvg/resvg-wasm/index_bg.wasm')
  return wasmModule
}

export async function ensureResvgInitialized(wasmModule?: InitInput): Promise<void> {
  if (!resvgInit) {
    resvgInit = Promise.resolve(wasmModule ?? loadBundledResvgWasm())
      .then(module => initWasm(module))
      .catch((error) => {
        resvgInit = null
        throw error
      })
  }
  await resvgInit
}
