type ToolResult = {
  isError?: boolean
  structuredContent?: Record<string, unknown>
  content?: Array<{ type?: string, text?: string }>
}

type OpenAIHost = {
  toolInput?: Record<string, unknown>
  uploadFile(file: File): Promise<{ fileId: string }>
  getFileDownloadUrl(input: { fileId: string }): Promise<{ downloadUrl: string }>
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>
}

declare global {
  interface Window {
    openai?: OpenAIHost
  }
}

const styles = `
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: transparent; color: CanvasText; }
  main { display: grid; gap: 12px; max-width: 560px; }
  h1 { margin: 0; font-size: 18px; }
  p { margin: 0; color: GrayText; font-size: 14px; line-height: 1.45; }
  label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
  input { width: 100%; padding: 12px; border: 1px solid ButtonBorder; border-radius: 10px; background: Canvas; }
  button { justify-self: start; border: 0; border-radius: 999px; padding: 10px 16px; background: #1f2547; color: white; font-weight: 700; cursor: pointer; }
  button:disabled { cursor: wait; opacity: .6; }
  [role=status] { min-height: 22px; font-size: 14px; }
  .error { color: #b42318; }
  .success { color: #067647; }
`

function textFromResult(result: ToolResult): string {
  return result.content?.find(item => item.type === 'text')?.text ?? 'The upload tool returned an error.'
}

function render() {
  const style = document.createElement('style')
  style.textContent = styles
  document.head.append(style)

  const root = document.querySelector<HTMLDivElement>('#app')
  if (!root) throw new Error('Video upload widget root is missing')

  const main = document.createElement('main')
  const title = document.createElement('h1')
  title.textContent = 'Upload a video'
  const help = document.createElement('p')
  help.textContent = 'Choose an MP4, WebM, MOV, or AVI file. It will be saved to this site’s media library and returned ready to assign.'
  const label = document.createElement('label')
  label.textContent = 'Video file'
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'video/mp4,video/webm,video/quicktime,video/x-msvideo,.mp4,.webm,.mov,.avi'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Upload video'
  const status = document.createElement('div')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  label.append(input)
  main.append(title, help, label, button, status)
  root.append(main)

  button.addEventListener('click', async () => {
    status.className = ''
    const file = input.files?.[0]
    if (!file) {
      status.className = 'error'
      status.textContent = 'Choose a video first.'
      return
    }
    if (!file.type.startsWith('video/')) {
      status.className = 'error'
      status.textContent = 'That file is not a supported video.'
      return
    }

    const host = window.openai
    const siteId = host?.toolInput?.site_id
    if (!host || typeof siteId !== 'string' || !siteId) {
      status.className = 'error'
      status.textContent = 'The ChatGPT host did not provide a site. Re-open the widget and try again.'
      return
    }

    button.disabled = true
    status.textContent = 'Uploading…'
    try {
      const { fileId } = await host.uploadFile(file)
      const { downloadUrl } = await host.getFileDownloadUrl({ fileId })
      const result = await host.callTool('upload_user_media', {
        site_id: siteId,
        category: typeof host.toolInput?.category === 'string' ? host.toolInput.category : 'other',
        file: {
          file_id: fileId,
          file_name: file.name,
          mime_type: file.type,
          download_url: downloadUrl,
        },
      })
      if (result.isError) throw new Error(textFromResult(result))
      const output = result.structuredContent ?? result as Record<string, unknown>
      const assetId = output.asset_id ?? output.assetId
      const publicUrl = output.public_url ?? output.publicUrl
      if (typeof assetId !== 'string' || typeof publicUrl !== 'string') {
        throw new Error('Upload completed without an assignable media asset.')
      }
      status.className = 'success'
      status.textContent = `Uploaded ${file.name}. Asset ${assetId} is ready to assign.`
    } catch (error) {
      status.className = 'error'
      status.textContent = error instanceof Error ? error.message : 'Video upload failed.'
    } finally {
      button.disabled = false
    }
  })
}

render()

export {}
