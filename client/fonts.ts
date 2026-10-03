export const readingFont = "'LXGW WenKai Lite', 'Kaiti SC', 'KaiTi', 'PingFang SC', sans-serif"
export async function loadReadingFonts() {
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all([
      document.fonts.load('400 16px "LXGW WenKai Lite"'),
      document.fonts.load('500 16px "LXGW WenKai Lite"'),
    ])
  }
}
export async function embeddedFonts() {
  const resources = await Promise.all(
    ['LXGWWenKaiLite-Regular.woff2', 'LXGWWenKaiLite-Medium.woff2', 'OFL.txt'].map(async (name) => {
      if (import.meta.env.SSR) {
        const { readFile } = await import('node:fs/promises')
        const { dirname, resolve } = await import('node:path')
        const { fileURLToPath } = await import('node:url')
        const bytes = await readFile(
          resolve(dirname(fileURLToPath(import.meta.url)), '../web/public/fonts', name),
        )
        return name.endsWith('.txt')
          ? bytes.toString('utf8')
          : `data:font/woff2;base64,${bytes.toString('base64')}`
      }
      const response = await fetch(`/fonts/${name}`)
      if (!response.ok) throw new Error('字体资源加载失败，请重试。')
      if (name.endsWith('.txt')) return response.text()
      const blob = await response.blob()
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }),
  )
  return {
    css: `@font-face{font-family:'LXGW WenKai Lite';font-weight:400;src:url(${resources[0]}) format('woff2')}@font-face{font-family:'LXGW WenKai Lite';font-weight:500;src:url(${resources[1]}) format('woff2')}`,
    license: resources[2],
  }
}
