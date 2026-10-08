import { type ReportModule as Module, type PeriodStatistics, periodCells } from '@shared/report'
import { Link, useNavigate } from 'react-router'
import { ErrorBoundary } from '@/components/error-boundary'
import { ReportChart, WordCloud } from '@/components/report-visual'
import type { readingPath } from '@/navigation'

export const number = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
export type MonthPath = (month: string) => ReturnType<typeof readingPath>
const isMonth = (label: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(label)

export function PeriodTable({
  periods,
  monthPath,
}: {
  periods: PeriodStatistics[]
  monthPath?: MonthPath
}) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable data tables need keyboard access.
    <section className="table-scroll" aria-label="周期阅读统计" tabIndex={0}>
      <table className="report-table period-table">
        <caption className="sr-only">周期阅读统计，缺失字段显示为破折号</caption>
        <thead>
          <tr>
            {['时间', '阅读时长', '阅读天数', '读过', '读完', '笔记'].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={`${period.start}:${period.end}:${period.label}`}>
              <th scope="row">
                {monthPath && isMonth(period.label) ? (
                  <Link className="text-link" to={monthPath(period.label)}>
                    {period.label}
                  </Link>
                ) : (
                  period.label
                )}
                <small>
                  {period.start || '起始未知'} — {period.end}
                </small>
              </th>
              {periodCells(period).map((value, index) => (
                <td key={['seconds', 'days', 'read', 'finished', 'notes'][index]}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
function DataTable({ module, monthPath }: { module: Module; monthPath: MonthPath }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable data tables need keyboard access.
    <section className="table-scroll" aria-label={`${module.title}完整明细`} tabIndex={0}>
      <table className="report-table">
        <caption className="sr-only">{module.title}，全部已返回记录</caption>
        <thead>
          <tr>
            <th scope="col">{module.kind === 'authors' ? '作者' : '项目'}</th>
            <th scope="col">{module.kind === 'authors' ? '阅读本数' : '数值与单位'}</th>
            {module.kind === 'authors' && <th scope="col">阅读时长</th>}
            {module.kind === 'scatter' && <th scope="col">阅读进度 %</th>}
          </tr>
        </thead>
        <tbody>
          {module.data.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Upstream chart rows have no IDs and book titles can repeat; rows hold no state.
            <tr key={`${index}:${row.label}`}>
              <th scope="row">
                {isMonth(row.label) ? (
                  <Link className="text-link" to={monthPath(row.label)}>
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </th>
              <td>
                {module.unit === '日期'
                  ? '最近一次活动'
                  : `${number(row.value)} ${row.unit ?? module.unit}`}
              </td>
              {module.kind === 'authors' && <td>{row.readTime || '—'}</td>}
              {module.kind === 'scatter' && <td>{number(row.secondary)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
export function ReportModule({
  module,
  scope,
  generatedAt,
  monthPath,
  expanded,
  onExpanded,
}: {
  module: Module
  scope: string
  generatedAt: string
  monthPath: MonthPath
  expanded: boolean
  onExpanded: (expanded: boolean) => void
}) {
  const navigate = useNavigate()
  const available = !['empty', 'unavailable'].includes(module.status)
  const hasData = module.data.length > 0 || !!module.periods?.length
  return (
    <article
      id={`module-${module.id}`}
      className={`data-panel report-module${module.kind === 'heatmap' || module.periods?.length ? ' module-wide' : ''}`}
      data-module={module.id}
    >
      <div className="panel-heading">
        <h3>{module.title}</h3>
      </div>
      {module.scope !== scope && <p className="scope-note">{module.scope}</p>}
      {module.status === 'partial' && (
        <p className="scope-note">
          部分覆盖 · {module.coverage.reason || '当前仅展示已采集数据。'}
        </p>
      )}
      {module.kind === 'radar' && <p className="scope-note">相对权重，不是阅读时长百分比。</p>}
      {module.kind === 'bar' &&
        module.data.length > 12 &&
        !/^\d{4}/.test(module.data[0]?.label ?? '') && (
          <p className="scope-note">图中按数值展示前 12 项，完整记录见明细。</p>
        )}
      {!available || !hasData ? (
        <p className="module-empty">
          {module.status === 'unavailable' ? '当前数据暂不可用。' : '当前没有可展示的记录。'}
          {module.coverage.reason || module.description}
        </p>
      ) : module.periods?.length ? (
        <PeriodTable periods={module.periods.slice(0, 4)} monthPath={monthPath} />
      ) : module.kind === 'authors' ? (
        <div className="author-ranking">
          <p className="scope-note">
            按阅读本数{module.data.length > 5 && ' · 前 5 位'}；时长为上游原文。
          </p>
          <ol>
            {module.data.slice(0, 5).map((author) => (
              <li key={author.label}>
                <div className="author-heading">
                  <span>{author.label}</span>
                  <strong>{number(author.value)} 本</strong>
                </div>
                <div className="author-detail">
                  <small>阅读 {author.readTime || '—'}</small>
                  <span className="author-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${(author.value / Math.max(1, ...module.data.map((row) => row.value))) * 100}%`,
                      }}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : module.kind === 'table' ? (
        <div className="data-rows">
          {module.data.slice(0, 8).map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Snapshot labels can repeat and these display rows hold no state.
            <div key={`${index}:${row.label}`}>
              <p>{row.label}</p>
              {module.unit !== '日期' && (
                <span>
                  {number(row.value)} {row.unit ?? module.unit}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ErrorBoundary
          key={`${module.id}:${generatedAt}`}
          fallback={
            <p role="alert" className="module-empty">
              图表暂时无法显示，可查看下方数据明细或刷新页面重试。
            </p>
          }
        >
          {module.kind === 'words' ? (
            <WordCloud module={module} />
          ) : (
            <ReportChart
              module={module}
              onSelect={(label) => {
                if (isMonth(label)) void navigate(monthPath(label))
              }}
            />
          )}
        </ErrorBoundary>
      )}
      <details
        className="method-details"
        open={expanded}
        onToggle={(event) => {
          if (event.currentTarget.open !== expanded) onExpanded(event.currentTarget.open)
        }}
      >
        <summary>完整数据与统计口径</summary>
        {expanded && (
          <>
            <p>{module.description}</p>
            <p>实际范围：{module.scope}</p>
            <p>
              采集覆盖：{module.coverage.loaded} / {module.coverage.expected ?? '未知'} ·{' '}
              {module.coverage.complete ? '已齐全' : '部分或不可用'} · 失败 {module.coverage.failed}
            </p>
            {module.coverage.reason && <p>{module.coverage.reason}</p>}
            <p>
              采集时间：
              {new Date(generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
              （北京时间）
            </p>
            {module.periods?.length ? (
              <>
                <PeriodTable periods={module.periods} monthPath={monthPath} />
                <h4>统计明细原文</h4>
                {module.periods.map((period) => (
                  <p key={`${period.start}:${period.end}:${period.label}`}>
                    {period.label}：
                    {period.stats.map((stat) => `${stat.name} ${stat.text}`).join('；') ||
                      '未提供统计摘要'}
                  </p>
                ))}
              </>
            ) : module.data.length ? (
              <DataTable module={module} monthPath={monthPath} />
            ) : (
              <p>当前没有可展示的明细。</p>
            )}
          </>
        )}
      </details>
    </article>
  )
}
