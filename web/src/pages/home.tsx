import { ArrowRight } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { restorePrivateEntry } from '@/lib/analytics'

export default function Home() {
  useEffect(restorePrivateEntry, [])
  return (
    <section className="welcome">
      <p className="eyebrow">你的个人阅读档案</p>
      <h2>
        看见你的
        <br />
        阅读轨迹<span className="welcome-accent">。</span>
      </h2>
      <p className="welcome-description">
        把微信读书里的时间、书架与划线，整理成一份可以回看的阅读档案。
      </p>
      <div className="welcome-actions">
        <Button asChild>
          <Link to="/settings">
            连接我的阅读 <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/demo">先翻翻示例</Link>
        </Button>
      </div>
      <p className="welcome-hint">无需先登录。查看后可下载报告，也可登录保存连接。</p>
    </section>
  )
}
