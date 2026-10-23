import { safeReturn } from '@client/returnPath'
import {
  Archive,
  BookOpen,
  ChartNoAxesCombined,
  Home,
  Library,
  NotebookPen,
  Settings,
  UserRound,
} from 'lucide-react'

export const navigation = [
  { path: '/', title: '首页', icon: Home },
  { path: '/overview', title: '阅读概览', icon: BookOpen },
  { path: '/report', title: '深度报告', icon: ChartNoAxesCombined },
  { path: '/shelf', title: '我的书架', icon: Library },
  { path: '/notes', title: '阅读笔记', icon: NotebookPen },
] as const

export const accountNavigation = [
  { path: '/archives', title: '历史报告', icon: Archive },
  { path: '/settings', title: '连接设置', icon: Settings },
  { path: '/login', title: '登录', icon: UserRound },
] as const

export const reportViews = ['overview', 'report', 'shelf', 'notes'] as const

export function reportView(pathname: string, search: string) {
  const path = pathname.replace(/\/+$/, '')
  const view =
    path === '/demo' || path.startsWith('/archives/')
      ? new URLSearchParams(search).get('view')
      : path.slice(1)
  return reportViews.find((item) => item === view) ?? 'overview'
}

export function readingPath(pathname: string, search: string, view: string) {
  let params = new URLSearchParams(search)
  if (pathname.replace(/\/+$/, '') === '/login' && params.has('next')) {
    params = new URLSearchParams(safeReturn(params.get('next')).split('?')[1])
    params.delete('save')
    params.delete('saveReport')
  }
  for (const key of [...params.keys()])
    if (
      !['range', 'view', 'source', 'connection', 'save', 'saveReport', 'book', 'month'].includes(
        key,
      )
    )
      params.delete(key)
  const demo = pathname.replace(/\/+$/, '') === '/demo'
  const archive = pathname.startsWith('/archives/')
  if (demo || archive) params.set('view', view)
  else params.delete('view')
  if (view !== 'notes') {
    params.delete('book')
    params.delete('month')
  }
  return { pathname: archive ? pathname : demo ? '/demo' : `/${view}`, search: `?${params}` }
}

export function pageTitle(pathname: string, search = '') {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path.startsWith('/archives/')) return '历史报告'
  if (path === '/demo')
    return (
      navigation.find((item) => item.path === `/${reportView(path, search)}`)?.title ?? '阅读概览'
    )
  return (
    [...navigation, ...accountNavigation].find((item) => item.path === path)?.title ?? '页面未找到'
  )
}
