import { api } from '@client/api'
import { ARCHIVE_LIMIT, type ArchivedReport, type ArchiveSummary } from '@shared/archive'
import { duration } from '@shared/report'
import { useQuery } from '@tanstack/react-query'
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
  const account = connections.data?.account
  const context = account?.context
  const enabled = !!context && !connections.isFetching && !connections.isError
  const key = ['private', context, 'archives', id ?? 'detail'] as const
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const action = useAction()
  const mounted = useRef(true)
  const list = useQuery({
    queryKey: ['private', context, 'archives', 'list'],
    enabled: enabled && !id,
    queryFn: ({ signal }) => api<ArchiveList>('/account/archives', { signal }),
  })
  const detail = useQuery({
    queryKey: key,
    enabled: enabled && !!id,
    queryFn: ({ signal }) =>
      api<ArchivedReport>(`/account/archives/${encodeURIComponent(id ?? '')}`, { signal }),
  })
  const currentError = connections.error ?? (id ? detail.error : list.error)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopPrivate()
    }
  }, [])
  useEffect(() => {
    if (!account || !connections.data) return
    const remaining = Date.parse(account.expiresAt) - Date.parse(connections.data.serverTime)
    const timer = window.setTimeout(
      () => {
        stopPrivate(true)
        void connections.refetch()
      },
      Math.max(0, remaining),
    )
    return () => window.clearTimeout(timer)
  }, [account, connections.data, connections.refetch])

  async function remove(archiveId: string) {
    if (action.isPending || !enabled) return
    const run = flow.generation
    setError('')
    try {
      await action.run(async () => {
        await write(() => {
          if (!mounted.current || run !== flow.generation)
            throw new DOMException('页面已变化', 'AbortError')
          return api(`/account/archives/${archiveId}`, { method: 'DELETE' })
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
          api<ArchivedReport>(`/account/archives/${encodeURIComponent(id ?? '')}`, { signal }),
      })
      if (!mounted.current || run !== flow.generation)
        throw new DOMException('页面已变化', 'AbortError')
      return { id: value.id, version: 0, keyVersion: 0, report: value.report }
    } catch (value) {
      if (['AUTH_REQUIRED', 'ARCHIVE_NOT_FOUND'].includes(errorCode(value))) {
        queries.removeQueries({ queryKey: key })
        setError(message(value))
      }
      throw value
    }
  }
  if (connections.isFetching || (enabled && (id ? detail.isPending : list.isPending)))
    return <p role="status">正在读取历史报告…</p>
  if (currentError)
    return (
      <section className="empty-state">
        <p role="alert">{message(currentError)}</p>
        {errorCode(currentError) === 'AUTH_REQUIRED' ? (
          <Link
            className="text-link"
            to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
          >
            重新登录
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
  if (!account)
    return (
      <section className="empty-state">
        <p>登录后查看已保存的报告。</p>
        <Link
          className="text-link"
          to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        >
          登录
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
        <div className="archive-heading">
          <Link className="text-link" to="/archives">
            返回历史报告
          </Link>
          <p>
            保存于 {date(saved.createdAt)} · {saved.includeNotes ? '含笔记正文' : '未存笔记正文'}
          </p>
        </div>
        <p className="result-count">
          采集于 {date(saved.generatedAt)} ·{' '}
          {saved.sourceStatus === 'completed' && saved.coverage.complete ? '采集完成' : '部分数据'}{' '}
          · 笔记覆盖 {saved.coverage.loaded} / {saved.coverage.expected ?? '未知'} 本
        </p>
        <WorkspaceContent
          key={`${context}:${saved.id}:${location.key}`}
          report={saved.report}
          reading={{
            archive: { id: saved.id, includeNotes: saved.includeNotes },
            range: saved.range.key,
            sample: false,
            development: false,
            connection: 'account',
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
  return (
    <section className="archive-page">
      <div className="section-heading">
        <h2>
          已保存 {list.data?.items.length ?? 0} / {list.data?.limit ?? ARCHIVE_LIMIT} 份
        </h2>
        <Link className="text-link" to="/overview">
          查看当前报告
        </Link>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {!list.data?.items.length && (
        <p className="empty-state">还没有存档。在报告中选择“保存报告”即可保留快照。</p>
      )}
      <div className="archive-list">
        {list.data?.items.map((saved) => (
          <article key={saved.id} className="archive-row">
            <div>
              <h3>
                <Link className="text-link" to={`/archives/${saved.id}`}>
                  {saved.range.label} · {saved.range.start || '起始日期未知'} — {saved.range.end}
                </Link>
              </h3>
              <p>
                {duration(saved.summary.seconds)} · {saved.summary.shelfCount ?? '未知'} 项书架记录
                · {saved.includeNotes ? '含笔记正文' : '未存笔记正文'}
                {saved.sourceStatus !== 'completed' || !saved.coverage.complete
                  ? ' · 部分数据'
                  : ''}
              </p>
              <time dateTime={saved.createdAt}>保存于 {date(saved.createdAt)}</time>
            </div>
            <div className="connection-actions">
              {confirmation === saved.id ? (
                <>
                  <span>删除这份存档？</span>
                  <Button disabled={action.isPending} onClick={() => void remove(saved.id)}>
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
                <Button
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() => setConfirmation(saved.id)}
                >
                  删除
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
