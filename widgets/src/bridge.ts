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

  // ChatGPT dispatches this event when globals are ready
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.globals?.toolOutput != null) {
      callback(detail.globals.toolOutput);
      clearInterval(timer);
      window.removeEventListener("openai:set_globals", handler);
    }
  };
  window.addEventListener("openai:set_globals", handler);

  // Fallback poll for up to 10 seconds
  let checks = 40;
  const timer = setInterval(() => {
    if (tryRead() || --checks <= 0) {
      clearInterval(timer);
      window.removeEventListener("openai:set_globals", handler);
    }
  }, 250);
}

export function sendUiMessage(text: string) {
  window.openai?.sendFollowUpMessage({ prompt: text });
}

export function updateModelContext(state: Record<string, unknown>) {
  window.openai?.setWidgetState(state);
}

export function callTool(name: string, args: Record<string, unknown>) {
  window.openai?.callTool(name, args);
}

export function openExternal(url: string) {
  if (window.openai?.openExternal) {
    window.openai.openExternal({ href: url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
