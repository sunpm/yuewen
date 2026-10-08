import { ArrowRight, BookOpen, ChartNoAxesCombined, Library, NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

const sections = [
  { to: '/overview', icon: BookOpen, title: '阅读概览', text: '把读过的时间，汇成清晰的轨迹。' },
  {
    to: '/report',
    icon: ChartNoAxesCombined,
    title: '深度报告',
    text: '从习惯、节律与偏好，回看阅读。',
  },
  { to: '/shelf', icon: Library, title: '我的书架', text: '在一本本书之间，找到来时的路。' },
  { to: '/notes', icon: NotebookPen, title: '阅读笔记', text: '让划线与想法，重新连成记忆。' },
]

export default function Home() {
  return (
    <>
      <section className="welcome">
        <p className="eyebrow">你的个人阅读档案</p>
        <h2>
          看见你的
          <br />
          阅读轨迹<span>。</span>
        </h2>
        <p className="welcome-description">将阅读时间、书架与划线，整理成属于你的阅读档案。</p>
        <Button asChild>
          <Link to="/overview">
            走进阅读档案 <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
      <nav className="section-grid" aria-label="探索阅读档案">
        {sections.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="section-link">
            <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
            <h3>
              {title}
              <ArrowRight size={16} aria-hidden="true" />
            </h3>
            <p>{text}</p>
          </Link>
        ))}
      </nav>
    </>
  )
}
