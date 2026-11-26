import { createDemo } from '@shared/demo'
import { duration } from '@shared/report'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { restorePrivateEntry } from '@/lib/analytics'

export default function Home() {
  useEffect(restorePrivateEntry, [])
  const [coverFailed, setCoverFailed] = useState(false)
  const preview = useMemo(() => {
    const report = createDemo('2025', new Date('2025-12-31T12:00:00Z'))
    const calendar = report.modules.find((module) => module.kind === 'heatmap')?.data ?? []
    const firstWeekday = (new Date(report.range.start).getUTCDay() + 6) % 7
    const topBook = [...report.books].sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0))[0]
    return {
      year: report.range.key,
      seconds: report.summary.seconds,
      readDays: report.summary.readDays,
      calendar,
      firstWeekday,
      topBook,
      quote: report.portrait.quote,
    }
  }, [])

  return (
    <section className="welcome-stage">
      <div className="welcome">
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
        <p className="welcome-hint">
          示例可直接体验。私有报告需通过实例访问保护，可保存或离线下载。
        </p>
      </div>

      <aside className="welcome-atlas" aria-label="模拟阅读档案示意">
        <Link to="/demo" className="atlas-ledger">
          <div className="atlas-head">
            <span className="atlas-label">
              <BookOpen size={15} aria-hidden="true" />
              年度阅读纹路 · {preview.year}
            </span>
            <span className="atlas-badge">模拟示例</span>
          </div>
          <svg
            className="atlas-heatmap"
            viewBox="0 0 265 35"
            role="img"
            aria-label={`${preview.year} 年模拟阅读日历热力点阵`}
          >
            {preview.calendar.map((day, index) => (
              <rect
                key={day.label}
                x={Math.floor((preview.firstWeekday + index) / 7) * 5}
                y={((preview.firstWeekday + index) % 7) * 5}
                width="3.5"
                height="3.5"
                rx="0.6"
                fill="var(--primary)"
                fillOpacity={day.value ? 0.28 + 0.72 * Math.min(day.value / 100, 1) : 0.1}
              />
            ))}
          </svg>
          <dl className="atlas-metrics">
            <div>
              <dt>模拟阅读时长</dt>
              <dd>{duration(preview.seconds)}</dd>
            </div>
            <div>
              <dt>有效阅读日</dt>
              <dd>{preview.readDays ?? '—'} 天</dd>
            </div>
          </dl>
        </Link>

        <div className="atlas-pair">
          {preview.topBook && (
            <Link to="/demo?view=shelf" className="atlas-card atlas-book-card">
              <div className="atlas-mini-cover" aria-hidden="true">
                {preview.topBook.cover?.startsWith('https://') && !coverFailed ? (
                  <img
                    src={preview.topBook.cover}
                    alt=""
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setCoverFailed(true)}
                  />
                ) : (
                  <span>{preview.topBook.title.slice(0, 1)}</span>
                )}
              </div>
              <div className="atlas-card-copy">
                <strong>《{preview.topBook.title}》</strong>
                <span>{preview.topBook.author}</span>
                <small className="atlas-cue">翻看示例书架 →</small>
              </div>
            </Link>
          )}

          {preview.quote && (
            <Link to="/demo?view=notes" className="atlas-card atlas-quote-card">
              <blockquote>“{preview.quote.text}”</blockquote>
              <div className="atlas-quote-meta">
                <span>《{preview.quote.title}》</span>
                <small className="atlas-cue">示例笔记 →</small>
              </div>
            </Link>
          )}
        </div>
      </aside>
    </section>
  )
}
