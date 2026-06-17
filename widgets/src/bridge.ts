// OpenAI Apps SDK bridge — data via window.openai.toolOutput, actions via window.openai.*

type OpenAiApi = {
  toolOutput?: Record<string, unknown> | null;
  toolResponseMetadata?: Record<string, unknown> | null;
  toolInput?: Record<string, unknown>;
  widgetState?: Record<string, unknown>;
  setWidgetState: (_state: Record<string, unknown>) => unknown;
  callTool: (_name: string, _args: Record<string, unknown>) => unknown;
  sendFollowUpMessage: (_args: { prompt: string }) => unknown;
  uploadFile?: (
    _file: File,
    _options?: { library?: boolean }
  ) => Promise<{ fileId?: string; file_id?: string } | string>;
  getFileDownloadUrl?: (
    _args: { fileId: string }
  ) => Promise<{ downloadUrl?: string; download_url?: string } | string>;
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

function extractWidgetToolResult(source: unknown): unknown {
  if (!source || typeof source !== "object") return null;

  const record = source as Record<string, unknown>;
  const metadata = record.toolResponseMetadata;
  if (metadata && typeof metadata === "object") {
    const metaRecord = metadata as Record<string, unknown>;
    const mcpToolResult = metaRecord.mcp_tool_result;
    if (mcpToolResult && typeof mcpToolResult === "object") {
      return mcpToolResult;
    }
    const callToolResult = metaRecord.call_tool_result;
    if (callToolResult && typeof callToolResult === "object") {
      const nested = (callToolResult as Record<string, unknown>).result;
      if (nested && typeof nested === "object") return nested;
    }
    return metaRecord;
  }

  return record;
}

function extractWidgetData(source: unknown): unknown {
  const toolResult = extractWidgetToolResult(source);
  if (!toolResult || typeof toolResult !== "object") return toolResult;

  const result = toolResult as {
    _meta?: { ["krabiclaw/widgetData"]?: unknown };
    structuredContent?: unknown;
  };

  return result?._meta?.["krabiclaw/widgetData"]
    ?? result?.structuredContent
    ?? toolResult;
}

export function onToolResult(callback: (_result: unknown) => void) {
  function tryRead() {
    const api = window.openai;
    // Prefer toolOutput (the actual result data) over toolResponseMetadata (invocation state).
    // ChatGPT sets toolResponseMetadata to our invocation labels which have no widget data.
    const source = api?.toolOutput != null
      ? api.toolOutput
      : api?.toolResponseMetadata != null
        ? { toolResponseMetadata: api.toolResponseMetadata }
        : null;
    if (source !== undefined && source !== null) {
      const widgetData = extractWidgetData(source);
      callback(widgetData);
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
      const widgetData = extractWidgetData(params);
      callback(widgetData);
      clearInterval(timer);
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("openai:set_globals", globalsHandler);
    }
  };
  window.addEventListener("message", messageHandler, { passive: true });

  // ChatGPT dispatches this event when globals are ready
  const globalsHandler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    const globals = detail?.globals as Record<string, unknown> | null | undefined;
    if (!globals) return;
    // Prefer toolOutput (the actual result); toolResponseMetadata may only hold invocation state.
    const source: unknown = globals.toolOutput != null
      ? globals.toolOutput
      : globals.toolResponseMetadata != null
        ? { toolResponseMetadata: globals.toolResponseMetadata }
        : null;
    if (source === undefined || source === null) return;
    const widgetData = extractWidgetData(source);
    callback(widgetData);
    clearInterval(timer);
    window.removeEventListener("message", messageHandler);
    window.removeEventListener("openai:set_globals", globalsHandler);
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

export function onToolInput(callback: (_input: unknown) => void) {
  function tryRead() {
    const input = window.openai?.toolInput;
    if (input !== undefined && input !== null) {
      callback(input);
      return true;
    }
    return false;
  }

  if (tryRead()) return;

  const messageHandler = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const message = event.data as JsonRpcMessage;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method !== "ui/notifications/tool-input") return;

    callback(message.params);
    clearInterval(timer);
    window.removeEventListener("message", messageHandler);
    window.removeEventListener("openai:set_globals", globalsHandler);
  };
  window.addEventListener("message", messageHandler, { passive: true });

  const globalsHandler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.globals?.toolInput != null) {
      callback(detail.globals.toolInput);
      clearInterval(timer);
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("openai:set_globals", globalsHandler);
    }
  };
  window.addEventListener("openai:set_globals", globalsHandler);

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

export function callToolWithResult<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (window.openai?.callTool) {
    return Promise.resolve(window.openai.callTool(name, args)).then((raw) => {
      const result = raw as { isError?: boolean; structuredContent?: T; content?: Array<{ text?: string }> } | T
      if (result && typeof result === 'object' && 'isError' in result && (result as { isError?: boolean }).isError) {
        const errText = (result as { content?: Array<{ text?: string }> }).content?.[0]?.text || `${name} failed.`
        throw new Error(errText)
      }
      if (result && typeof result === 'object' && 'structuredContent' in result) {
        return (result as { structuredContent: T }).structuredContent
      }
      return raw as T
    })
  }

  return new Promise<T>((resolve, reject) => {
    const toolCallId = `tool-${name}-${Date.now()}`
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage)
      reject(new Error(`Timed out waiting for ${name} result.`))
    }, 60000)

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const message = event.data as {
        jsonrpc?: string
        id?: string | number
        result?: {
          structuredContent?: T
          isError?: boolean
          content?: Array<{ text?: string }>
        }
        error?: { message?: string }
      }

      if (!message || message.jsonrpc !== "2.0" || message.id !== toolCallId) {
        return
      }

      window.clearTimeout(timeout)
      window.removeEventListener("message", handleMessage)

      if (message.error?.message) {
        reject(new Error(message.error.message))
        return
      }

      if (message.result?.isError) {
        reject(new Error(message.result.content?.[0]?.text || `${name} failed.`))
        return
      }

      resolve((message.result?.structuredContent ?? {}) as T)
    }

    window.addEventListener("message", handleMessage, { passive: true })
    window.parent.postMessage(
      {
        jsonrpc: "2.0",
        id: toolCallId,
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      },
      "*",
    )
  })
}

function extractUploadedFileId(result: unknown): string | null {
  if (typeof result === "string" && result.trim()) return result;
  if (!result || typeof result !== "object") return null;

  const record = result as Record<string, unknown>;
  const directCandidates = [
    record.fileId,
    record.file_id,
    record.id,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  const nestedCandidates = [
    record.file,
    record.upload,
    record.result,
    record.data,
  ];
  for (const candidate of nestedCandidates) {
    const nestedId = extractUploadedFileId(candidate);
    if (nestedId) return nestedId;
  }

  if (Array.isArray(record.files)) {
    for (const file of record.files) {
      const nestedId = extractUploadedFileId(file);
      if (nestedId) return nestedId;
    }
  }

  return null;
}

export async function uploadFile(file: File) {
  if (window.openai?.uploadFile) {
    const result = await window.openai.uploadFile(file, { library: false });
    return extractUploadedFileId(result);
  }

  throw new Error("ChatGPT file upload API is unavailable in this widget.")
}

export async function getFileDownloadUrl(fileId: string) {
  if (window.openai?.getFileDownloadUrl) {
    const result = await window.openai.getFileDownloadUrl({ fileId });
    if (typeof result === "string" && result.trim()) return result;
    const record = result as Record<string, unknown> | null | undefined;
    const url = record?.downloadUrl ?? record?.download_url;
    if (typeof url === "string" && url.trim()) return url;
    return null;
  }

  throw new Error("ChatGPT file download API is unavailable in this widget.")
}

export function openExternal(url: string) {
  if (window.openai?.openExternal) {
    window.openai.openExternal({ href: url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
