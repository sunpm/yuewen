import cloud from 'd3-cloud'
import type { Datum } from '@shared/report'
import { loadReadingFonts, readingFont } from './fonts'

export interface CloudWord extends Datum {
  text: string
  size: number
  x?: number
  y?: number
}

export async function layoutWords(data: Datum[], availableWidth: number, signal?: AbortSignal) {
  signal?.throwIfAborted()
  // d3-cloud uses a 32-bit collision board; keep the layout width aligned.
  const width = Math.max(256, Math.floor(availableWidth / 32) * 32)
  let height = 280
  if (!data.length) return { words: [] as CloudWord[], width, height }
  let canvas: () => HTMLCanvasElement
  if (import.meta.env.SSR) {
    const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas')
    const { fileURLToPath } = await import('node:url')
    if (
      !GlobalFonts.has('LXGW WenKai Lite') &&
      !GlobalFonts.registerFromPath(
        fileURLToPath(new URL('../web/public/fonts/LXGWWenKaiLite-Regular.woff2', import.meta.url)),
        'LXGW WenKai Lite',
      )
    )
      throw new Error('词云字体加载失败，请重试。')
    canvas = () => createCanvas(1, 1) as unknown as HTMLCanvasElement
  } else {
    await loadReadingFonts().catch(() => {
      /* Measure the same system fallback used by SVG. */
    })
    canvas = () => document.createElement('canvas')
  }
  const context = canvas().getContext('2d')!
  const min = Math.min(...data.map((d) => d.value))
  const max = Math.max(...data.map((d) => d.value))
  const words = data.map((d) => ({
    ...d,
    text: [...d.label].length > 16 ? `${[...d.label].slice(0, 15).join('')}…` : d.label,
    size: max === min ? 28 : 14 + (28 * (d.value - min)) / (max - min),
  }))
  // Scale every word equally so fitting a long word never reverses frequency sizes.
  const scale = Math.min(
    1,
    ...words.map((word) => {
      context.font = `${word.size}px ${readingFont}`
      return (width - 64) / context.measureText(`${word.text}m`).width
    }),
  )
  let placed: CloudWord[] = []
  for (let attempt = 0; attempt < 4; attempt++) {
    signal?.throwIfAborted()
    placed = await new Promise<CloudWord[]>((resolve, reject) => {
      const layout = cloud<CloudWord>()
        .canvas(canvas)
        .size([width, height])
        .words(words.map((word) => ({ ...word })))
        .font(readingFont)
        .fontSize((word) => Math.max(12, word.size * scale))
        .rotate(0)
        .padding(3)
        .random(() => 0.5)
        .timeInterval(12)
        .on('end', (words) => {
          signal?.removeEventListener('abort', abort)
          resolve(words)
        })
      function abort() {
        layout.stop()
        reject(signal?.reason)
      }
      signal?.addEventListener('abort', abort, { once: true })
      layout.start()
    })
    if (placed.length === words.length || attempt === 3) break
    height = Math.round(height * 1.5)
  }
  return { words: placed, width, height }
}
