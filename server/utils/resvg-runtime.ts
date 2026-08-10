import { initWasm, type InitInput } from '@resvg/resvg-wasm'

let resvgInit: Promise<void> | null = null

async function loadBundledResvgWasm(): Promise<WebAssembly.Module> {
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
