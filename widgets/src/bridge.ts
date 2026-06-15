// OpenAI Apps SDK bridge — data via window.openai.toolOutput, actions via window.openai.*

type OpenAiApi = {
  toolOutput?: Record<string, unknown> | null;
  toolInput?: Record<string, unknown>;
  widgetState?: Record<string, unknown>;
  setWidgetState: (_state: Record<string, unknown>) => unknown;
  callTool: (_name: string, _args: Record<string, unknown>) => unknown;
  sendFollowUpMessage: (_args: { prompt: string }) => unknown;
  openExternal?: (_args: { href: string; redirectUrl?: false }) => unknown;
};

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown> | null;
};

declare global {
  interface Window {
    openai?: OpenAiApi;
  }
}

export function injectStyles(css: string) {
  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
}

export function onToolResult(callback: (_result: unknown) => void) {
  function tryRead() {
    const output = window.openai?.toolOutput;
    if (output !== undefined && output !== null) {
      callback(output);
      return true;
    }
    return false;
  }

  if (tryRead()) return;

  const messageHandler = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const message = event.data as JsonRpcMessage;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method !== "ui/notifications/tool-result") return;

    const params = message.params;
    if (params && "structuredContent" in params) {
      callback(params.structuredContent);
      clearInterval(timer);
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("openai:set_globals", globalsHandler);
    }
  };
  window.addEventListener("message", messageHandler, { passive: true });

  // ChatGPT dispatches this event when globals are ready
  const globalsHandler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.globals?.toolOutput != null) {
      callback(detail.globals.toolOutput);
      clearInterval(timer);
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("openai:set_globals", globalsHandler);
    }
  };
  window.addEventListener("openai:set_globals", globalsHandler);

  // Fallback poll for up to 10 seconds
  let checks = 40;
  const timer = setInterval(() => {
    if (tryRead() || --checks <= 0) {
      clearInterval(timer);
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("openai:set_globals", globalsHandler);
    }
  }, 250);
}

export function sendUiMessage(text: string) {
  if (window.openai?.sendFollowUpMessage) {
    window.openai.sendFollowUpMessage({ prompt: text });
    return;
  }
  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      method: "ui/message",
      params: {
        role: "user",
        content: [{ type: "text", text }],
      },
    },
    "*",
  );
}

export function updateModelContext(state: Record<string, unknown>) {
  if (window.openai?.setWidgetState) {
    window.openai.setWidgetState(state);
    return;
  }
  const text = Object.entries(state)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      id: `ctx-${Date.now()}`,
      method: "ui/update-model-context",
      params: { content: [{ type: "text", text }] },
    },
    "*",
  );
}

export function callTool(name: string, args: Record<string, unknown>) {
  if (window.openai?.callTool) {
    window.openai.callTool(name, args);
    return;
  }
  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      id: `tool-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: args },
    },
    "*",
  );
}

export function openExternal(url: string) {
  if (window.openai?.openExternal) {
    window.openai.openExternal({ href: url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
