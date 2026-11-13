import { isRangeKey } from '@shared/report'
import { pageTitle, reportView } from '@/navigation'

export const feedbackIssuesUrl = 'https://github.com/sunpm/yuewen/issues/new'

export function feedbackIssueUrl(pathname: string, search: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(search)
  const range = params.get('range')
  const paths = [
    '/',
    '/demo',
    '/overview',
    '/report',
    '/shelf',
    '/notes',
    '/settings',
    '/login',
    '/archives',
  ]
  const safePath = path.startsWith('/archives/')
    ? '/archives/:id'
    : paths.includes(path)
      ? path
      : '/'
  const agent = navigator.userAgent
  const browser = /Edg\/([\d.]+)/.exec(agent) ?? /(?:Chrome|Firefox|Version)\/([\d.]+)/.exec(agent)
  const browserName = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'unknown'
  const os = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad/.test(agent)
      ? 'iOS'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Mac OS/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : 'unknown'
  const environment = [
    `- 页面：${pageTitle(path, search)} (${safePath})`,
    ...(path === '/demo' || path.startsWith('/archives/')
      ? [`- 视图：${reportView(path, search)}`]
      : []),
    ...(isRangeKey(range) ? [`- 时间范围：${range}`] : []),
    `- 浏览器：${browserName} ${browser?.[1] ?? ''}`.trimEnd(),
    `- 系统：${os}`,
    `- 主题：${document.documentElement.classList.contains('dark') ? '深色' : '浅色'}`,
    `- 窗口：${window.innerWidth} × ${window.innerHeight}，DPR ${window.devicePixelRatio}`,
  ].join('\n')
  const query = new URLSearchParams({
    title: `[反馈] ${pageTitle(path, search)}`,
    body: `## 问题或建议\n\n\n## 复现步骤\n\n\n## 页面环境\n\n${environment}\n`,
  })
  return `${feedbackIssuesUrl}?${query}`
}
