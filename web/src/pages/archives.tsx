import { api } from '@client/api'
import { ARCHIVE_LIMIT, type ArchivedReport, type ArchiveSummary } from '@shared/archive'
import { duration } from '@shared/report'
import { useQuery } from '@tanstack/react-query'
import { Archive, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  errorCode,
  flow,
  message,
  online,
  queries,
  stopPrivate,
  useAction,
  useConnections,
  write,
} from '@/lib/business'
import { WorkspaceContent } from '@/pages/workspace'

const date = (value: string) =>
  new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
type ArchiveList = { items: ArchiveSummary[]; limit: number; maxBytes: number }

export default function Archives() {
  const { id } = useParams()
  const location = useLocation()
  const connections = useConnections()
  const instance = connections.data?.instance
  const context = instance?.context
  const enabled = !!context && !connections.isFetching && !connections.isError
  const key = ['private', context, 'archives', id ?? 'detail'] as const
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const action = useAction()
  const mounted = useRef(true)
  const list = useQuery({
    queryKey: ['private', context, 'archives', 'list'],
    enabled: enabled && !id,
    queryFn: ({ signal }) => api<ArchiveList>('/archives', { signal }),
  })
  const detail = useQuery({
    queryKey: key,
    enabled: enabled && !!id,
    queryFn: ({ signal }) =>
      api<ArchivedReport>(`/archives/${encodeURIComponent(id ?? '')}`, { signal }),
  })
  const currentError = connections.error ?? (id ? detail.error : list.error)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopPrivate()
    }
  }, [])

  async function remove(archiveId: string) {
    if (action.isPending || !enabled) return
    const run = flow.generation
    setError('')
    try {
      await action.run(async () => {
        await write(() => {
          if (!mounted.current || run !== flow.generation)
            throw new DOMException('页面已变化', 'AbortError')
          return api(`/archives/${archiveId}`, { method: 'DELETE' })
        })
        if (!mounted.current || run !== flow.generation) return
        setConfirmation('')
        queries.removeQueries({ queryKey: ['private', context, 'archives', archiveId] })
        await list.refetch()
      })
    } catch (value) {
      if (mounted.current && run === flow.generation) setError(message(value))
    }
  }
  async function readSnapshot() {
    online()
    const run = flow.generation
    try {
      const value = await queries.fetchQuery({
        queryKey: key,
        queryFn: ({ signal }) =>
          api<ArchivedReport>(`/archives/${encodeURIComponent(id ?? '')}`, { signal }),
      })
      if (!mounted.current || run !== flow.generation)
        throw new DOMException('页面已变化', 'AbortError')
      return { id: value.id, version: 0, keyVersion: 0, report: value.report }
    } catch (value) {
      if (['ACCESS_REQUIRED', 'ARCHIVE_NOT_FOUND'].includes(errorCode(value))) {
        queries.removeQueries({ queryKey: key })
        setError(message(value))
      }
      throw value
    }
  }
  if (connections.isFetching || (enabled && (id ? detail.isPending : list.isPending)))
    return (
      <p className="route-loading" role="status">
        正在读取历史报告…
      </p>
    )
  if (currentError)
    return (
      <section className="empty-state">
        <p role="alert">{message(currentError)}</p>
        {errorCode(currentError) === 'ACCESS_REQUIRED' ? (
          <Link className="text-link" to={location.pathname + location.search}>
            重新通过部署访问保护
          </Link>
        ) : (
          <Button
            onClick={() =>
              void (connections.isError
                ? connections.refetch()
                : id
                  ? detail.refetch()
                  : list.refetch())
            }
          >
            重试
          </Button>
        )}
        {id && (
          <Link className="text-link" to="/archives">
            返回历史报告
          </Link>
        )}
      </section>
    )
  if (!instance)
    return (
      <section className="empty-state">
        <p>通过部署访问保护后查看已保存报告。</p>
        <Link className="text-link" to={location.pathname + location.search}>
          重新打开
        </Link>
      </section>
    )
  if (id) {
    const saved = detail.data
    if (!saved || error)
      return (
        <section className="empty-state">
          <p role="alert">{error || '存档不存在或已删除。'}</p>
          <Link className="text-link" to="/archives">
            返回历史报告
          </Link>
        </section>
      )
    return (
      <>
        <div className="data-panel archive-banner">
          <div className="archive-heading">
            <Link className="text-link" to="/archives">
              <ArrowLeft size={15} aria-hidden="true" />
              返回历史报告
            </Link>
            <div className="archive-chips">
              <span className="archive-chip">保存于 {date(saved.createdAt)}</span>
              <span className="archive-chip">
                {saved.includeNotes ? '含笔记正文' : '未存笔记正文'}
              </span>
              <span className="archive-chip">
                {saved.sourceStatus === 'completed' && saved.coverage.complete
                  ? '采集完成'
                  : '部分数据'}
              </span>
            </div>
          </div>
          <p className="archive-banner-meta">
            采集于 {date(saved.generatedAt)} · 笔记覆盖 {saved.coverage.loaded} /{' '}
            {saved.coverage.expected ?? '未知'} 本 · 只读快照
          </p>
        </div>
        <WorkspaceContent
          key={`${context}:${saved.id}:${location.key}`}
          report={saved.report}
          reading={{
            archive: { id: saved.id, includeNotes: saved.includeNotes },
            range: saved.range.key,
            sample: false,
            development: false,
            connection: 'instance',
            connections,
            task: null,
            busy: false,
            saving: false,
            completeReport: readSnapshot,
            bookDetail: async (bookId) =>
              saved.report.books.find((book) => book.id === bookId) ?? {},
            touch: async () => {},
            loadNotes: async () => {},
          }}
        />
      </>
    )
  }

  const count = list.data?.items.length ?? 0
  const limit = list.data?.limit ?? ARCHIVE_LIMIT
  const ratio = Math.min(100, Math.round((count / Math.max(1, limit)) * 100))

  return (
    <section className="archive-page">
      <div className="archive-summary-bar">
        <div className="archive-quota">
          <h2>
            已保存 {count} / {limit} 份
          </h2>
          <div className="quota-track" aria-hidden="true">
            <span style={{ width: `${ratio}%` }} />
          </div>
        </div>
        <Link className="text-link" to="/overview">
          查看当前报告 <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {!count && (
        <div className="empty-state archive-empty">
          <Archive size={28} strokeWidth={1.6} aria-hidden="true" />
          <p>还没有存档。在报告页面中展开「保存报告」，即可保留一份独立快照。</p>
          <div className="welcome-actions">
            <Button variant="outline" asChild>
              <Link to="/overview">前往当前报告</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/demo">查看示例报告</Link>
            </Button>
          </div>
        </div>
      )}
      <div className="archive-list">
        {list.data?.items.map((saved) => (
          <article key={saved.id} className="data-panel archive-row">
            <div className="archive-row-main">
              <div className="archive-row-title">
                <span className="archive-tag">{saved.range.label}</span>
                <h3>
                  <Link className="text-link" to={`/archives/${saved.id}`}>
                    {saved.range.start || '起始日期未知'} — {saved.range.end}
                  </Link>
                </h3>
              </div>
              <div className="archive-chips">
                <span className="archive-chip">{duration(saved.summary.seconds)}</span>
                <span className="archive-chip">
                  {saved.summary.shelfCount ?? '未知'} 项书架记录
                </span>
                <span className="archive-chip">
                  {saved.includeNotes ? '含笔记正文' : '未存笔记正文'}
                </span>
                {(saved.sourceStatus !== 'completed' || !saved.coverage.complete) && (
                  <span className="archive-chip is-partial">部分数据</span>
                )}
              </div>
              <time dateTime={saved.createdAt}>保存于 {date(saved.createdAt)}</time>
            </div>
            <div className="connection-actions">
              {confirmation === saved.id ? (
                <>
                  <span className="muted-copy">删除这份存档？</span>
                  <Button
                    variant="destructive"
                    disabled={action.isPending}
                    onClick={() => void remove(saved.id)}
                  >
                    确认删除
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={action.isPending}
                    onClick={() => setConfirmation('')}
                  >
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <Link to={`/archives/${saved.id}`}>打开</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={action.isPending}
                    onClick={() => setConfirmation(saved.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    删除
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
