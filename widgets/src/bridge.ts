// Bridge between widget iframe and ChatGPT via JSON-RPC 2.0 postMessage.

export function injectStyles(css: string) {
  const el = document.createElement('style')
  el.textContent = css
  document.head.appendChild(el)
}

let _msgId = 1

export function sendUiMessage(text: string) {
  window.parent.postMessage({
    jsonrpc: '2.0',
    method: 'ui/message',
    params: { content: [{ type: 'text', text }] },
  }, '*')
}

export function updateModelContext(context: Record<string, unknown>) {
  window.parent.postMessage({
    jsonrpc: '2.0',
    method: 'ui/update-model-context',
    params: { context },
  }, '*')
}

export function callTool(name: string, args: Record<string, unknown>) {
  window.parent.postMessage({
    jsonrpc: '2.0',
    id: _msgId++,
    method: 'tools/call',
    params: { name, arguments: args },
  }, '*')
}

export function onToolResult(callback: (result: unknown) => void) {
  window.addEventListener('message', (e) => {
    if (e.data?.method === 'ui/notifications/tool-result') {
      callback(e.data?.params?.result ?? e.data?.params)
    }
  })
}
