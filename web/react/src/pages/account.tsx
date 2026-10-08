import { BookOpen } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'

export default function Account() {
  const { pathname } = useLocation()
  return (
    <section className="empty-state">
      <BookOpen size={36} strokeWidth={1.25} aria-hidden="true" />
      <h2>先翻翻示例，再留下自己的阅读</h2>
      <p>
        {pathname.replace(/\/+$/, '') === '/settings'
          ? '连接功能尚未接入，此预览不接收 API Key。'
          : '登录功能尚未接入，此预览不接收邮箱、密码或验证码。'}
      </p>
      <Button variant="outline" asChild>
        <Link to="/demo">查看示例布局</Link>
      </Button>
    </section>
  )
}
