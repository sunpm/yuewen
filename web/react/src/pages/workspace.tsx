import {
  type Book,
  duration,
  preferenceScope,
  type ReadingReport,
  type ReportModule,
  shanghaiDate,
} from '@shared/report'
import { Download, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ConnectionNotice } from '@/components/connection-notice'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useReading } from '@/hooks/use-reading'
import { flow, message, queries, useAction } from '@/lib/business'
import { saveView, selectViewOwner, views, viewVersion } from '@/lib/view-memory'
import { readingPath, reportView } from '@/navigation'

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

type Reading = ReturnType<typeof useReading>
const ranges = [
  { value: 'recent', label: '最近 24 个月' },
  { value: 'weekly', label: '本周' },
  { value: 'monthly', label: '本月' },
  ...[0, 1, 2].map((offset) => {
    const year = String(Number(shanghaiDate().slice(0, 4)) - offset)
    return { value: year, label: `${year} 年` }
  }),
  { value: 'overall', label: '全部历史' },
]
function rangeOptions(range: string) {
  return ranges.some((item) => item.value === range)
    ? ranges
    : [...ranges, { value: range, label: `${range} 年` }]
}
export default function Workspace() {
  const reading = useReading()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const source = reading.sample
    ? '模拟示例 · 原创演示文本，非书中原文'
    : reading.development
      ? '本地开发数据'
      : reading.connection === 'guest'
        ? '临时连接'
        : '账号连接'
  const status = reading.restoring
    ? '正在核验并恢复报告…'
    : reading.busy
      ? reading.phase === 'notes'
        ? '正在补齐笔记'
        : (reading.task?.stage ?? '正在创建报告…')
      : reading.task
        ? {
            queued: '等待采集',
            running: '采集已暂停，可继续读取',
            completed: '采集完成',
            partial: '部分数据',
            cancelled: '已停止',
            failed: '采集失败',
          }[reading.task.status]
        : '尚未读取'
  return (
    <>
      <div className="collection-status">
        {import.meta.env.DEV && location.pathname.replace(/\/+$/, '') === '/demo' && (
          <Link
            className="text-link"
            to={
              reading.development
                ? `/demo?source=mock&range=${reading.range}`
                : `/demo?source=development&range=${reading.range}`
            }
          >
            {reading.development ? '切换模拟示例' : '使用本地开发来源'}
          </Link>
        )}
        <p role="status">
          {source}
          {!reading.sample && ` · ${status}`}
        </p>
        {!reading.sample && (
          <div className="connection-actions">
            {reading.valid && !reading.saving && (
              <>
                <Button
                  disabled={reading.restoring || reading.busy}
                  onClick={() => void reading.collect()}
                >
                  {reading.task
                    ? ['queued', 'running'].includes(reading.task.status)
                      ? '继续采集'
                      : '重新读取结果'
                    : '开始采集'}
                </Button>
                {reading.busy && (
                  <Button variant="outline" onClick={() => void reading.changeTask('cancel')}>
                    {reading.phase === 'notes' ? '停止读取' : '停止采集'}
                  </Button>
                )}
                {reading.task?.retryAllowed &&
                  ['cancelled', 'partial', 'failed'].includes(reading.task.status) && (
                    <Button
                      variant="outline"
                      disabled={reading.busy}
                      onClick={() => void reading.changeTask('retry')}
                    >
                      重试未完成部分
                    </Button>
                  )}
                {reading.task && (
                  <Button
                    variant="ghost"
                    disabled={reading.busy}
                    onClick={() => void reading.collect(true)}
                  >
                    重新生成此范围
                  </Button>
                )}
              </>
            )}
            {!reading.development && (
              <Link
                className="text-link"
                to={`/settings?connection=${reading.connection}&range=${encodeURIComponent(reading.range)}&next=${encodeURIComponent(location.pathname + location.search)}`}
              >
                {reading.connections.data?.[reading.connection] ? '管理连接' : '配置连接'}
              </Link>
            )}
            {reading.error && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (reading.development)
                    void queries.invalidateQueries({ queryKey: ['development-connection'] })
                  else void reading.connections.refetch()
                }}
              >
                重新核验连接
              </Button>
            )}
          </div>
        )}
      </div>
      {reading.errorMessage && (
        <p role="alert" className="notice">
          {reading.errorMessage}
        </p>
      )}
      {reading.task && (
        <details className="method-details">
          <summary>采集与期限</summary>
          <p>
            {reading.task.stage} · 已读取正文 {reading.task.report.notes.length} /{' '}
            {reading.task.noteTotal} 条；覆盖 {reading.task.report.coverage.loaded} /{' '}
            {reading.task.report.coverage.expected ?? '未知'} 本。
          </p>
          <p>
            本次最多 600 个上游请求、10,000 条正文或 1.5 MB 采集状态；达到任一预算后可下载已有结果。
          </p>
          <p>
            闲置截止：
            {new Date(reading.task.idleExpiresAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
            })}
            ；最晚截止：
            {new Date(reading.task.expiresAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
            })}
            （北京时间）。
          </p>
        </details>
      )}
      {reading.task?.issueCode && (
        <p role="alert" className="notice">
          {reading.task.report.issues.join('；') || '采集已停止，已有结果仍可下载。'}
        </p>
      )}
      {reading.conflict && (
        <div className="notice">
          <p>账号已有其他会话的临时报告。替换会停止并清除原报告。</p>
          <div className="connection-actions">
            <Button onClick={() => void reading.collect(true, true)}>确认替换并生成</Button>
            <Button variant="outline" onClick={reading.dismissConflict}>
              取消，保留原报告
            </Button>
          </div>
        </div>
      )}
      {!reading.sample && !reading.development && reading.connection === 'guest' && (
        <ConnectionNotice
          key={`${params.get('save') ?? ''}:${reading.connections.data?.account?.context ?? ''}`}
          taskId={reading.task?.id}
          connections={reading.connections.data}
          disabled={reading.restoring}
        />
      )}
      {reading.report ? (
        <WorkspaceContent
          key={`${reading.task?.id ?? 'sample'}:${reading.task?.keyVersion ?? 0}`}
          reading={reading}
          report={reading.report}
        />
      ) : (
        <section className="empty-state">
          <Choice
            label="统计范围"
            value={reading.range}
            options={rangeOptions(reading.range)}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('range', value)
              next.delete('month')
              setParams(next)
            }}
          />
          <p>
            {reading.restoring
              ? '请稍候，核验通过后显示当前连接的报告。'
              : reading.saving
                ? '正在处理保存意图；采集已暂停。'
                : reading.valid
                  ? '选择范围后开始采集。刷新和重连只恢复已有结果。'
                  : '连接微信读书后即可采集和下载，无需先登录。'}
          </p>
        </section>
      )}
    </>
  )
}
function WorkspaceContent({ reading, report }: { reading: Reading; report: ReadingReport }) {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const range = reading.range
  const view = reportView(location.pathname, location.search)
  const owner = `${reading.development ? 'development' : reading.sample ? 'sample' : reading.connections.data?.[reading.connection]?.context}:${reading.task?.id ?? 'demo'}`
  const viewKey = `${owner}:${location.key}`
  const [saved] = useState(() => {
    selectViewOwner(owner)
    return views.get(viewKey)
  })
  const [memoryVersion] = useState(viewVersion)
  const [section, setSection] = useState<(typeof sections)[number]>(saved?.section ?? '时间')
  const [search, setSearch] = useState(saved?.search ?? '')
  const [category, setCategory] = useState(saved?.category ?? '全部')
  const [sort, setSort] = useState(saved?.sort ?? 'recent')
  const [list, setList] = useState(saved?.list ?? false)
  const [noteType, setNoteType] = useState(saved?.noteType ?? '全部')
  const [noteLimit, setNoteLimit] = useState(saved?.noteLimit ?? 24)
  const [includeNotes, setIncludeNotes] = useState(saved?.includeNotes ?? false)
  const [downloadError, setDownloadError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const downloading = useAction()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function downloadReport(type: 'html' | 'json') {
    if (downloading.isPending) return
    const run = flow.generation
    setDownloadError('')
    try {
      await downloading.run(async () => {
        const current = await reading.completeReport()
        const { download, exportData, makeHtml } = await import('@client/export')
        const content =
          type === 'html'
            ? await makeHtml(current.report, includeNotes)
            : JSON.stringify(exportData(current.report, includeNotes), null, 2)
        if (!mounted.current || run !== flow.generation) return
        if (!reading.sample) {
          const checked = await reading.completeReport()
          if (
            checked.id !== current.id ||
            checked.keyVersion !== current.keyVersion ||
            checked.version !== current.version
          )
            throw new Error('报告已更新，请重新生成下载文件。')
        }
        if (mounted.current && run === flow.generation) download(content, type, reading.sample)
      })
    } catch (error) {
      if (mounted.current) setDownloadError(message(error))
    }
  }
  async function copyNote(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      if (mounted.current) setCopyMessage('已复制笔记。')
    } catch {
      if (mounted.current) setCopyMessage('复制失败，请选择正文手动复制。')
    }
  }
  const snapshot = useRef({
    section,
    search,
    category,
    sort,
    list,
    noteType,
    noteLimit,
    includeNotes,
    scroll: 0,
  })
  useEffect(() => {
    snapshot.current = {
      section,
      search,
      category,
      sort,
      list,
      noteType,
      noteLimit,
      includeNotes,
      scroll: window.scrollY,
    }
  }, [section, search, category, sort, list, noteType, noteLimit, includeNotes])
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (saved) window.scrollTo(0, saved.scroll)
      else if (location.hash)
        document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()
    })
    const remember = () => {
      snapshot.current.scroll = window.scrollY
    }
    window.addEventListener('scroll', remember, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', remember)
      saveView(viewKey, snapshot.current, memoryVersion)
    }
  }, [viewKey, saved, location.hash, memoryVersion])
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
          <BookDetails
            key={`${book.id}:${reading.task?.version ?? 0}`}
            book={book}
            reading={reading}
            notesPath={notesFor(book.id)}
          />
        </div>
      </article>
    )
  }

  return (
    <section
      aria-label="报告内容"
      onPointerDown={() => void reading.touch()}
      onKeyDown={() => void reading.touch()}
    >
      <div className="report-toolbar">
        <div className="range-group">
          <Choice
            label="统计范围"
            value={range}
            onChange={(value) => updateParam('range', value)}
            options={rangeOptions(range)}
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
            <label>
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(event) => setIncludeNotes(event.target.checked)}
              />{' '}
              包含全部已采集笔记
            </label>
            <div className="connection-actions">
              <Button
                disabled={downloading.isPending || reading.busy || reading.saving}
                onClick={() => void downloadReport('html')}
              >
                HTML
              </Button>
              <Button
                variant="outline"
                disabled={downloading.isPending || reading.busy || reading.saving}
                onClick={() => void downloadReport('json')}
              >
                JSON
              </Button>
            </div>
            {downloading.isPending && <p role="status">正在补齐已采集分页并生成下载文件…</p>}
            {downloadError && <p role="alert">{downloadError}</p>}
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
                最近 {Math.min(6, report.modules[1].data.length)} 项
                {reading.sample && ' · 模拟数据'}
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
              <span className="eyebrow">
                划线回顾{report.portrait.quote.demoText && ' · 演示文本'}
              </span>
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
          {copyMessage && <p role="status">{copyMessage}</p>}
          {reading.task && !reading.task.notesComplete && (
            <Button
              variant="outline"
              disabled={reading.busy}
              onClick={() => void reading.loadNotes()}
            >
              补齐已采集笔记
            </Button>
          )}
          <div className="note-list">
            {notes.slice(0, noteLimit).map((note) => (
              <article key={note.id} className="note-item">
                <div className="note-meta">
                  <span>
                    {note.type === 'thought' ? '想法' : '划线'}
                    {note.demoText && ' · 演示文本'}
                  </span>
                  <time>{note.date}</time>
                </div>
                <blockquote className={note.type === 'highlight' ? 'highlight-text' : ''}>
                  {note.text}
                </blockquote>
                {note.abstract && (
                  <div className="note-abstract">
                    <span>关联划线{note.demoText && ' · 演示文本'}</span>
                    <p>{note.abstract}</p>
                  </div>
                )}
                <p className="note-source">
                  《{note.title}》 · {note.author} · {note.chapter}
                </p>
                <Button variant="ghost" onClick={() => void copyNote(note.text)}>
                  复制笔记
                </Button>
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
    </section>
  )
}

function BookDetails({
  book,
  reading,
  notesPath,
}: {
  book: Book
  reading: Reading
  notesPath: ReturnType<typeof readingPath>
}) {
  const [detail, setDetail] = useState<Partial<Book>>()
  const [error, setError] = useState('')
  const action = useAction()
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function load() {
    if (detail || action.isPending) return
    const run = flow.generation
    setError('')
    try {
      await action.run(async () => {
        const result = await reading.bookDetail(book.id)
        if (alive.current && run === flow.generation) setDetail(result)
      })
    } catch (value) {
      if (alive.current && run === flow.generation) setError(message(value))
    }
  }
  return (
    <details
      className="book-details"
      onToggle={(event) => {
        if (event.currentTarget.open) void load()
      }}
    >
      <summary>书籍详情</summary>
      <p>{detail?.title || book.title}</p>
      {action.isPending && <p role="status">正在读取详情…</p>}
      {error && (
        <p role="alert">
          {error}{' '}
          <Button variant="ghost" onClick={() => void load()}>
            重试
          </Button>
        </p>
      )}
      <p>
        {detail?.description ||
          book.description ||
          (book.imported
            ? '导入书籍可能没有公开简介，保留已取得的信息。'
            : '暂未取得这本书的简介。')}
      </p>
      {detail?.publisher && <p>{detail.publisher}</p>}
      <p>
        本期 {duration(book.seconds)} · 累计 {book.noteCount ?? '未知'} 条笔记
      </p>
      <Link className="text-link" to={notesPath}>
        翻看这本书的笔记 →
      </Link>
    </details>
  )
}
