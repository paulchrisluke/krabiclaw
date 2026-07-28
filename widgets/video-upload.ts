type ToolResult = {
  isError?: boolean
  structuredContent?: Record<string, unknown>
  content?: Array<{ type?: string, text?: string }>
}

type OpenAIHost = {
  toolInput?: Record<string, unknown>
  toolResponseMetadata?: Record<string, unknown>
  uploadFile(_file: File): Promise<{ fileId: string }>
  getFileDownloadUrl(_input: { fileId: string }): Promise<{ downloadUrl: string }>
  callTool(_name: string, _args: Record<string, unknown>): Promise<ToolResult>
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function findStringKey(value: unknown, key: string, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 4) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findStringKey(item, key, depth + 1)
      if (nested) return nested
    }
    return null
  }
  const record = value as Record<string, unknown>
  const direct = record[key]
  if (typeof direct === 'string' && direct) return direct
  for (const nestedValue of Object.values(record)) {
    const nested = findStringKey(nestedValue, key, depth + 1)
    if (nested) return nested
  }
  return null
}

function assignmentLabel(target: unknown): string {
  if (target === 'home') return 'the home page'
  if (target === 'location') return 'the location'
  if (target === 'experience') return 'the experience'
  return 'the page'
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
    const responseContext = objectValue(host?.toolResponseMetadata?.context)
    const siteId = findStringKey(responseContext, 'site_id')
      ?? findStringKey(host?.toolResponseMetadata, 'site_id')
      ?? findStringKey(host?.toolInput, 'site_id')
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
      const assignment = objectValue(responseContext?.assignment)
      const assignmentArgs = objectValue(assignment?.args)
      const assignmentTool = assignment?.tool
      if (
        typeof assignmentTool === 'string'
        && ['set_home_hero_video', 'set_location_hero_video', 'set_experience_video'].includes(assignmentTool)
        && assignmentArgs
      ) {
        try {
          const assignmentResult = await host.callTool(assignmentTool, {
            ...assignmentArgs,
            asset_id: assetId,
          })
          if (assignmentResult.isError) throw new Error(textFromResult(assignmentResult))
          status.className = 'success'
          status.textContent = `Uploaded ${file.name} and assigned it to ${assignmentLabel(assignment.target)}.`
          return
        } catch (assignmentError) {
          const reason = assignmentError instanceof Error ? assignmentError.message : 'assignment failed'
          status.className = 'success'
          status.textContent = `Uploaded ${file.name}. Asset ${assetId} is ready to assign. Auto-assign failed: ${reason}`
          return
        }
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
