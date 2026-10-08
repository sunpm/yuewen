import {
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
  { path: '/settings', title: '连接设置', icon: Settings },
  { path: '/login', title: '登录', icon: UserRound },
] as const

export function pageTitle(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/demo') return '探索示例'
  return (
    [...navigation, ...accountNavigation].find((item) => item.path === path)?.title ?? '页面未找到'
  )
}
