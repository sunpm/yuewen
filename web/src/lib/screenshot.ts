import { getFontEmbedCSS, toCanvas } from 'html-to-image'

// Snapshot before showing the dialog; only the detached copy is redacted.
export async function capturePage(visible: boolean, signal: AbortSignal): Promise<Blob> {
  const root = document.querySelector<HTMLElement>('.app-shell')
  if (!root) throw new Error('未能生成截图。请提交文字反馈。')
  const width = visible ? window.innerWidth : root.scrollWidth
  const height = visible ? window.innerHeight : root.scrollHeight
  const scale = Math.min(1, Math.sqrt(4_000_000 / (width * height)))
  if (scale < 0.5 || width > 16384 || height > 16384 || root.querySelectorAll('*').length > 15000)
    throw new Error('页面过长，未能生成清晰的整页截图。可改截当前可见区域或提交文字。')
  const copy = root.cloneNode(true) as HTMLElement
  const originals = root.querySelectorAll('canvas')
  copy.querySelectorAll('canvas').forEach((canvas, index) => {
    const image = document.createElement('img')
    image.src = originals[index].toDataURL('image/png')
    image.style.cssText = canvas.style.cssText
    image.width = originals[index].width
    image.height = originals[index].height
    canvas.replaceWith(image)
  })
  copy
    .querySelectorAll('dialog, script, iframe, video, [data-feedback-exclude]')
    .forEach((node) => {
      node.remove()
    })
  copy
    .querySelectorAll<HTMLElement>(
      'input, textarea, select, [contenteditable], [data-feedback-private]',
    )
    .forEach((node) => {
      const mask = document.createElement('span')
      mask.textContent = '［已隐藏］'
      mask.style.cssText = 'display:inline-block;padding:8px;background:#ddd;color:#333'
      node.replaceWith(mask)
    })
  const frame = document.createElement('div')
  frame.setAttribute('aria-hidden', 'true')
  frame.inert = true
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none`
  copy.style.width = `${root.scrollWidth}px`
  if (visible) copy.style.transform = `translate(${-window.scrollX}px, ${-window.scrollY}px)`
  frame.append(copy)
  document.body.append(frame)
  let timer: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  try {
    return await Promise.race([
      (async () => {
        await document.fonts.ready
        controller.signal.throwIfAborted()
        if ([...document.fonts].some((font) => font.status === 'error'))
          throw new Error('页面字体未能加载，可提交文字反馈。')
        const fontEmbedCSS = await getFontEmbedCSS(frame, {
          preferredFontFormat: 'woff2',
          fetchRequestInit: { signal: controller.signal },
        })
        if (/url\(['"]?['"]?\)/.test(fontEmbedCSS))
          throw new Error('截图字体未能嵌入，可提交文字反馈。')
        controller.signal.throwIfAborted()
        const canvas = await toCanvas(frame, {
          width,
          height,
          canvasWidth: Math.floor(width * scale),
          canvasHeight: Math.floor(height * scale),
          pixelRatio: 1,
          backgroundColor: getComputedStyle(document.body).backgroundColor,
          style: { position: 'static', left: '0', top: '0' },
          fontEmbedCSS,
          fetchRequestInit: { signal: controller.signal },
        })
        try {
          for (const quality of [0.9, 0.75, 0.55]) {
            controller.signal.throwIfAborted()
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, 'image/jpeg', quality),
            )
            if (blob && blob.size <= 1024 * 1024) return blob
          }
          throw new Error('截图超过 1 MiB，可改截当前可见区域或移除图片。')
        } finally {
          canvas.width = 0
          canvas.height = 0
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('截图超时，可重试或提交文字反馈。'))
          controller.abort()
        }, 10000)
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error('未能生成截图，可提交文字反馈。')),
          { once: true },
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    controller.abort()
    frame.remove()
  }
}
