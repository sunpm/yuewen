import type { Insights, Metric } from '@shared/insights'
import { duration, type ReadingReport } from '@shared/report'
import { number, PeriodTable } from '@/components/report-module'

function Metrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="insight-grid">
      {metrics.map((metric) => (
        <article key={metric.label}>
          <h3>{metric.label}</h3>
          <strong>
            {number(metric.value)} <small>{metric.unit}</small>
          </strong>
          <p>{metric.reason}</p>
          {metric.numerator != null && metric.denominator != null && (
            <small>
              {number(metric.numerator)} ÷ {number(metric.denominator)}
              {metric.unit === '%' && ' × 100%'}
            </small>
          )}
        </article>
      ))}
    </div>
  )
}
export function TimeInsights({ insights }: { insights: Insights }) {
  return (
    <section className="data-panel report-insights" aria-label="阅读节律与变化">
      <h2>阅读节律与变化</h2>
      <p className="scope-note">{insights.scope}</p>
      <Metrics metrics={insights.metrics} />
      <details className="method-details">
        <summary>日内阅读时段</summary>
        <p>
          {insights.hourly.scope} · {insights.hourly.reason}
        </p>
        <dl className="hour-grid">
          {insights.hourly.data.map((hour) => (
            <div key={hour.label}>
              <dt>{hour.label}</dt>
              <dd>{number(hour.value)} 小时</dd>
            </div>
          ))}
        </dl>
      </details>
      <details className="method-details">
        <summary>月度环比</summary>
        <p>{insights.comparison.reason}</p>
        {!!insights.comparison.periods.length && (
          <PeriodTable periods={insights.comparison.periods} />
        )}
        <Metrics metrics={insights.comparison.metrics} />
      </details>
    </section>
  )
}
export function NoteDensity({ insights }: { insights: Insights }) {
  return (
    <details className="data-panel method-details report-insights">
      <summary>单书已采集笔记密度</summary>
      <p>已采集笔记／阅读小时 · {insights.scope}。仅描述已采集内容，不代表阅读质量。</p>
      {insights.density.map((book) => (
        <article key={book.bookId} className="density-row">
          <h3>{book.title}</h3>
          <p>
            {number(book.value)} 条／阅读小时 · {book.partial ? '部分覆盖' : '已读取'}
          </p>
          <p>
            {book.reason} 分子 {book.count} 条；时长{' '}
            {book.seconds == null ? '未知' : `${number(book.seconds / 3600)} 小时`}。
          </p>
        </article>
      ))}
      {!insights.density.length && <p>尚未取得可计算密度的书籍记录。</p>}
    </details>
  )
}
export function MonthDetail({ report, month }: { report: ReadingReport; month: string }) {
  const detail = report.insights?.months?.find((item) => item.month === month)
  return (
    <section className="data-panel month-detail" aria-label={`${month} 月份明细`}>
      <h2>{month} · 阅读与笔记</h2>
      {detail ? (
        <>
          <PeriodTable periods={[detail.period]} />
          {detail.period.stats.length > 0 && (
            <p className="scope-note">
              统计原文：{detail.period.stats.map((stat) => `${stat.name} ${stat.text}`).join('；')}
            </p>
          )}
          {detail.books?.length ? (
            <details className="method-details">
              <summary>该月单书时长排行</summary>
              <ol>
                {detail.books.map((book, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Monthly rankings provide titles without IDs; equal titles remain separate records.
                  <li key={`${index}:${book.title}`}>
                    {index + 1}. {book.title} · {duration(book.seconds)}
                  </li>
                ))}
              </ol>
              <p>仅含该月上游已返回的排行，可能有截断与展示阈值。</p>
            </details>
          ) : (
            <p>该月单书排行榜未取得，不使用年度榜单替代。</p>
          )}
        </>
      ) : (
        <p>未取得该月独立统计与书榜；下方仅筛选创建日期属于该月的已采集笔记。</p>
      )}
      <p className="scope-note">下载仍保留 {report.range.label} 的整份已采集报告。</p>
    </section>
  )
}
