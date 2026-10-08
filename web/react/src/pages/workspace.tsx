import { createDemo } from '@shared/demo'
import { type Book, duration, isRangeKey, preferenceScope, type ReportModule } from '@shared/report'
import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { readingPath, reportView } from '@/navigation'

// A fixed public sample keeps PC1 layout comparisons reproducible; no private API is used.
const previewDate = new Date('2026-10-09T04:00:00+08:00')
const sections = ['时间', '偏好', '书架', '笔记'] as const

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ModulePreview({ module, scope }: { module: ReportModule; scope: string }) {
  return (
    <article className="data-panel">
      <div className="panel-heading">
        <h3>{module.title}</h3>
        <span>{module.unit}</span>
      </div>
      {module.scope !== scope && <p className="scope-note">{module.scope}</p>}
      {module.status === 'partial' && (
        <p className="scope-note">部分数据 · {module.coverage.reason}</p>
      )}
      {module.periods?.length ? (
        <div className="data-rows">
          {module.periods.slice(0, 5).map((period) => (
            <div key={period.label}>
              <p>{period.label}</p>
              <span>
                {duration(period.seconds)} · {period.readDays ?? '—'} 天
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="data-rows">
        {module.data.slice(0, 5).map((row) => (
          <div key={row.label}>
            <p>{row.label}</p>
            {module.unit !== '日期' && (
              <span>
                {row.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}
                {row.unit ? ` ${row.unit}` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
      {!module.data.length && !module.periods?.length && (
        <p className="muted-copy">
          {module.coverage.reason ||
            module.description ||
            (module.status === 'unavailable' ? '未取得这项数据。' : '当前没有记录。')}
        </p>
      )}
      <details className="method-details">
        <summary>口径与覆盖说明</summary>
        <p>{module.description}</p>
        <p>{module.scope}</p>
        <p>
          {module.coverage.reason ||
            `已取得 ${module.coverage.loaded} 项${module.coverage.expected == null ? '，总数未知' : ` / 预期 ${module.coverage.expected} 项`}。`}
        </p>
      </details>
    </article>
  )
}

function BookCover({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="book-cover" aria-hidden="true">
      {book.cover?.startsWith('https://') && !failed ? (
        <img
          src={book.cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <small>阅纹 · 阅读藏书</small>
          <strong>{book.title}</strong>
          <span>{book.author}</span>
        </>
      )}
    </div>
  )
}

export default function Workspace() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const candidate = params.get('range')
  const range = isRangeKey(candidate) ? candidate : 'recent'
  const report = useMemo(() => createDemo(range, previewDate), [range])
  const view = reportView(location.pathname, location.search)
  const [section, setSection] = useState<(typeof sections)[number]>('时间')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [sort, setSort] = useState('recent')
  const [list, setList] = useState(false)
  const [noteType, setNoteType] = useState('全部')
  const [noteLimit, setNoteLimit] = useState(24)
  const month = params.get('month') ?? ''
  const bookId = params.get('book') ?? '全部'
  const pathFor = (target: string) => readingPath(location.pathname, location.search, target)
  const notesFor = (id: string) => {
    const target = pathFor('notes')
    const next = new URLSearchParams(target.search)
    next.set('book', id)
    next.delete('month')
    return { ...target, search: `?${next}` }
  }
  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'range') next.delete('month')
    setParams(next)
  }
  function clearFilters() {
    setSearch('')
    setCategory('全部')
    setNoteType('全部')
    setNoteLimit(24)
    const next = new URLSearchParams(params)
    next.delete('book')
    next.delete('month')
    if (params.has('book') || params.has('month')) setParams(next, { replace: true })
  }
  const books = report.books
    .filter(
      (book) =>
        (!search || `${book.title}${book.author}`.includes(search)) &&
        (category === '全部' || book.category === category),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'zh-CN')
        : sort === 'progress'
          ? (b.progress ?? -1) - (a.progress ?? -1)
          : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    )
  const notes = report.notes.filter(
    (note) =>
      (!search || `${note.text}${note.title}${note.abstract ?? ''}`.includes(search)) &&
      (bookId === '全部' || note.bookId === bookId) &&
      (noteType === '全部' || note.type === noteType) &&
      (!month || note.date?.startsWith(month)),
  )
  const scope =
    section === '偏好'
      ? preferenceScope(report.range)
      : section === '书架'
        ? '当前书架快照'
        : section === '笔记'
          ? '已读取笔记'
          : `${report.range.start} — ${report.range.end}`

  function bookCard(book: Book) {
    return (
      <article className="book-item" key={book.id}>
        <BookCover book={book} />
        <div className="book-copy">
          <h3>{book.title}</h3>
          <p>{book.author}</p>
          <span>
            {book.imported ? '导入书籍' : book.category} ·{' '}
            {book.progress == null ? '进度未获取' : `已读 ${book.progress}%`}
          </span>
          <details className="book-details">
            <summary>书籍详情</summary>
            <p>{book.title}</p>
            <p>{book.description ?? '暂未取得这本书的简介。'}</p>
            <p>
              本期 {duration(book.seconds)} · 累计 {book.noteCount ?? '未知'} 条笔记
            </p>
            <Link className="text-link" to={notesFor(book.id)}>
              翻看这本书的笔记 →
            </Link>
          </details>
        </div>
      </article>
    )
  }

  return (
    <>
      <div className="report-toolbar">
        <div className="range-group">
          <Choice
            label="统计范围"
            value={range}
            onChange={(value) => updateParam('range', value)}
            options={[
              { value: 'recent', label: '最近 24 个月' },
              { value: 'weekly', label: '本周' },
              { value: 'monthly', label: '本月' },
              ...[
                ...new Set(['2026', '2025', '2024', ...(/^\d{4}$/.test(range) ? [range] : [])]),
              ].map((year) => ({ value: year, label: `${year} 年` })),
              { value: 'overall', label: '全部历史' },
            ]}
          />
          <span className="date-range">
            {report.range.start} — {report.range.end}
          </span>
        </div>
        <details className="download-preview">
          <summary>
            <Download size={16} aria-hidden="true" />
            下载报告
          </summary>
          <div>
            <p>下载当前范围的整份报告；月份、单书、分类和搜索不改变下载范围。</p>
            <p>此布局预览暂不提供文件下载。</p>
            <Button disabled>HTML</Button>{' '}
            <Button variant="outline" disabled>
              JSON
            </Button>
          </div>
        </details>
      </div>
      {view === 'overview' && (
        <>
          <section className="metric-strip" aria-label="阅读核心指标">
            {[
              ['阅读与收听', duration(report.summary.seconds), '所选统计范围'],
              ['阅读天数', `${report.summary.readDays ?? '—'} 天`, '每日阅读满 1 分钟'],
              ['书架', `${report.summary.shelfCount ?? '—'} 项`, '当前快照 · 含有声内容'],
              ['笔记', `${report.summary.noteCount ?? '—'} 条`, '累计 · 含划线、想法、书签'],
            ].map(([label, value, detail]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </section>
          <div className="overview-grid">
            <section className="data-panel">
              <div className="panel-heading">
                <h2>月度阅读时长</h2>
                <span>小时</span>
              </div>
              <p className="muted-copy">
                最近 {Math.min(6, report.modules[1].data.length)} 项 · 模拟数据
              </p>
              <div className="time-bars">
                {report.modules[1].data.slice(-6).map((row) => (
                  <div key={row.label}>
                    <span>{row.label}</span>
                    <meter
                      min="0"
                      max={Math.max(1, ...report.modules[1].data.map((item) => item.value))}
                      value={row.value}
                      aria-label={`${row.label} 阅读小时`}
                    />
                    <strong>{row.value.toFixed(1)}</strong>
                  </div>
                ))}
              </div>
              <Link className="text-link" to={pathFor('report')}>
                查看深度报告 →
              </Link>
            </section>
            <section className="portrait-panel">
              <p className="eyebrow">阅读画像</p>
              <h2>{report.portrait.title}</h2>
              <p>{report.portrait.text}</p>
              <details className="method-details">
                <summary>查看画像依据</summary>
                <ul>
                  {report.portrait.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </section>
          </div>
          <div className="section-heading">
            <h2>最近阅读</h2>
            <Link className="text-link" to={pathFor('shelf')}>
              整个书架 →
            </Link>
          </div>
          <div className="book-grid">{books.slice(0, 4).map(bookCard)}</div>
          {report.portrait.quote && (
            <section className="quote-panel">
              <span className="eyebrow">划线回顾 · 演示文本</span>
              <blockquote>{report.portrait.quote.text}</blockquote>
              <p>
                《{report.portrait.quote.title}》 · {report.portrait.quote.date}
              </p>
              <Link className="text-link" to={pathFor('notes')}>
                翻看笔记 →
              </Link>
            </section>
          )}
        </>
      )}
      {view === 'report' && (
        <>
          <fieldset className="chapter-tabs">
            <legend className="sr-only">报告章节</legend>
            {sections.map((item) => (
              <Button
                key={item}
                variant={section === item ? 'default' : 'ghost'}
                aria-pressed={section === item}
                onClick={() => setSection(item)}
              >
                {item}
              </Button>
            ))}
          </fieldset>
          {section !== '时间' && <p className="scope-note">{scope}</p>}
          <p className="muted-copy">图表位置以数据摘要预览，每项最多展示 5 行。</p>
          {section === '时间' && report.insights && (
            <details className="method-details data-panel">
              <summary>阅读节律与变化</summary>
              <div className="data-rows">
                {report.insights.metrics.map((metric) => (
                  <div key={metric.label}>
                    <p>{metric.label}</p>
                    <span>
                      {metric.value == null
                        ? '—'
                        : metric.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}{' '}
                      {metric.unit}
                    </span>
                  </div>
                ))}
              </div>
              <p>自然日均包含未阅读日；阅读日均只计算有效阅读日。未知值不记为零。</p>
            </details>
          )}
          <div className="module-grid">
            {report.modules
              .filter((module) => module.section === section)
              .map((module) => (
                <ModulePreview key={module.id} module={module} scope={scope} />
              ))}
          </div>
        </>
      )}
      {(view === 'shelf' || view === 'notes') && (
        <div className="filter-toolbar">
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label={view === 'shelf' ? '搜索书名或作者' : '搜索划线与想法'}
              placeholder={view === 'shelf' ? '搜索书名或作者' : '搜索划线与想法'}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setNoteLimit(24)
              }}
            />
          </label>
          {view === 'shelf' ? (
            <>
              <Choice
                label="书架分类"
                value={category}
                onChange={setCategory}
                options={['全部', ...new Set(report.books.map((book) => book.category))].map(
                  (value) => ({ value, label: value === '全部' ? '全部分类' : value }),
                )}
              />
              <Choice
                label="书架排序"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'recent', label: '最近阅读' },
                  { value: 'title', label: '书名顺序' },
                  { value: 'progress', label: '阅读进度' },
                ]}
              />
              <Button variant="outline" aria-pressed={list} onClick={() => setList(!list)}>
                {list ? '封面视图' : '列表视图'}
              </Button>
            </>
          ) : (
            <>
              <Choice
                label="笔记来源书籍"
                value={bookId}
                onChange={(value) => updateParam('book', value === '全部' ? '' : value)}
                options={[
                  { value: '全部', label: '全部书籍' },
                  ...report.books.map((book) => ({ value: book.id, label: book.title })),
                ]}
              />
              <Choice
                label="笔记类型"
                value={noteType}
                onChange={(value) => {
                  setNoteType(value)
                  setNoteLimit(24)
                }}
                options={[
                  { value: '全部', label: '全部类型' },
                  { value: 'highlight', label: '划线' },
                  { value: 'thought', label: '想法' },
                ]}
              />
              {month && (
                <Button variant="outline" onClick={() => updateParam('month', '')}>
                  {month} ×
                </Button>
              )}
            </>
          )}
          {(search ||
            category !== '全部' ||
            noteType !== '全部' ||
            (view === 'notes' && (bookId !== '全部' || month))) && (
            <Button variant="ghost" onClick={clearFilters}>
              清除筛选
            </Button>
          )}
        </div>
      )}
      {view === 'shelf' && (
        <>
          <p className="result-count" role="status">
            当前书架 · {books.length} 个条目
          </p>
          <div className={`book-grid${list ? ' book-list' : ''}`}>{books.map(bookCard)}</div>
          {!books.length && <p className="empty-state">没有找到匹配的书籍，请调整或清除筛选。</p>}
        </>
      )}
      {view === 'notes' && (
        <>
          <p className="result-count" role="status">
            已读取笔记 · {notes.length} 条
          </p>
          <div className="note-list">
            {notes.slice(0, noteLimit).map((note) => (
              <article key={note.id} className="note-item">
                <div className="note-meta">
                  <span>{note.type === 'thought' ? '想法' : '划线'} · 演示文本</span>
                  <time>{note.date}</time>
                </div>
                <blockquote className={note.type === 'highlight' ? 'highlight-text' : ''}>
                  {note.text}
                </blockquote>
                {note.abstract && (
                  <div className="note-abstract">
                    <span>关联划线 · 演示文本</span>
                    <p>{note.abstract}</p>
                  </div>
                )}
                <p className="note-source">
                  《{note.title}》 · {note.author} · {note.chapter}
                </p>
              </article>
            ))}
          </div>
          {!notes.length && <p className="empty-state">没有找到匹配的笔记，请调整或清除筛选。</p>}
          {notes.length > noteLimit && (
            <Button variant="outline" onClick={() => setNoteLimit(noteLimit + 24)}>
              加载更多笔记（{noteLimit} / {notes.length}）
            </Button>
          )}
        </>
      )}
    </>
  )
}
