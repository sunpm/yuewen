import type { FeedbackEnvironment } from '@shared/feedback'
import { isRangeKey } from '@shared/report'
import { reportView } from '@/navigation'

export function feedbackLocation(pathname: string, search: string): FeedbackEnvironment {
  const path = pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(search)
  const connection = params.get('connection')
  const range = params.get('range')
  const paths = ['/', '/demo', '/overview', '/report', '/shelf', '/notes', '/settings', '/login']
  const source =
    path === '/demo'
      ? 'mock'
      : connection === 'account' || connection === 'guest'
        ? connection
        : 'none'
  const view = reportView(path, search)
  const agent = navigator.userAgent
  const browser = /Edg\/([\d.]+)/.exec(agent) ?? /(?:Chrome|Firefox|Version)\/([\d.]+)/.exec(agent)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const language = navigator.language

  return {
    entry: 'pc',
    path: (paths.includes(path) ? path : '/') as FeedbackEnvironment['path'],
    source,
    ...(isRangeKey(range) ? { range } : {}),
    view: view === 'shelf' ? 'bookshelf' : view === 'report' ? 'insights' : view,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    viewport: {
      width: Math.min(32768, window.innerWidth),
      height: Math.min(32768, window.innerHeight),
    },
    dpr: Math.max(0.1, Math.min(10, window.devicePixelRatio || 1)),
    ...(/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(language) && language.length <= 35
      ? { language }
      : {}),
    ...(timezone === 'UTC' || Intl.supportedValuesOf('timeZone').includes(timezone)
      ? { timezone }
      : {}),
    browser: /Edg\//.test(agent)
      ? 'Edge'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Firefox\//.test(agent)
          ? 'Firefox'
          : /Safari\//.test(agent)
            ? 'Safari'
            : 'unknown',
    ...(browser && /^\d+(?:\.\d+){0,3}$/.test(browser[1]) ? { browserVersion: browser[1] } : {}),
    os: /Android/.test(agent)
      ? 'Android'
      : /iPhone|iPad/.test(agent)
        ? 'iOS'
        : /Windows/.test(agent)
          ? 'Windows'
          : /Mac OS/.test(agent)
            ? 'macOS'
            : /Linux/.test(agent)
              ? 'Linux'
              : 'unknown',
    clientTime: new Date().toISOString(),
  }
}
