import { BookOpen } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'

const descriptions: Record<string, string> = {
  '/overview': '阅读时间与进度将在这里汇集。',
  '/report': '阅读节律、习惯与偏好将在这里展开。',
  '/shelf': '已读、在读与待读的书将在这里整理。',
  '/notes': '划线与想法将在这里保留原文、按书归集。',
  '/settings': '连接功能尚未接入，此预览不接收 API Key。',
  '/login': '登录功能尚未接入，此预览不接收邮箱、密码或验证码。',
  '/demo': '示例报告将在页面迁移后开放。',
}

export default function Workspace() {
  const { pathname } = useLocation()
  return (
    <section className="empty-state">
      <BookOpen size={36} strokeWidth={1.25} aria-hidden="true" />
      <h2>留一页，给下一段阅读</h2>
      <p>{descriptions[pathname.replace(/\/+$/, '')]}</p>
      <Button variant="outline" asChild>
        <Link to="/">返回首页</Link>
      </Button>
    </section>
  )
}
