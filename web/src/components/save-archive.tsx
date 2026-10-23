import { api } from '@client/api'
import { ARCHIVE_LIMIT, type ArchiveSummary } from '@shared/archive'
import type { Connection, ReportTask } from '@shared/connection'
import { Archive } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { flow, message, queries, useAction, write } from '@/lib/business'

export function SaveArchive({
  task,
  connection,
  loggedIn,
  disabled,
}: {
  task: ReportTask
  connection: Connection
  loggedIn: boolean
  disabled: boolean
}) {
  const location = useLocation()
  const [includeNotes, setIncludeNotes] = useState(false)
  const [saved, setSaved] = useState<ArchiveSummary | null>(null)
  const [error, setError] = useState('')
  const action = useAction()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function save() {
    if (disabled || action.isPending) return
    const run = flow.generation
    setError('')
    setSaved(null)
    try {
      await action.run(async () => {
        const result = await write(() => {
          if (!mounted.current || run !== flow.generation)
            throw new DOMException('页面已变化', 'AbortError')
          return api<ArchiveSummary>('/account/archives', {
            method: 'POST',
            headers: { 'X-Yuewen-Connection': connection },
            body: JSON.stringify({ reportId: task.id, version: task.version, includeNotes }),
          })
        })
        if (!mounted.current || run !== flow.generation) return
        setSaved(result)
        await queries.invalidateQueries({ predicate: (query) => query.queryKey[2] === 'archives' })
      })
    } catch (value) {
      if (mounted.current && run === flow.generation) setError(message(value))
    }
  }
  return (
    <details className="download-preview">
      <summary>
        <Archive size={16} aria-hidden="true" />
        保存报告
      </summary>
      <div>
        <p>保存当前快照，保留至主动删除。每个账号最多 {ARCHIVE_LIMIT} 份，每份 2 MiB。</p>
        {loggedIn ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={includeNotes}
                disabled={action.isPending}
                onChange={(event) => {
                  setIncludeNotes(event.target.checked)
                  setSaved(null)
                }}
              />{' '}
              保存全部已采集的划线与想法正文
            </label>
            {task.status !== 'completed' && <p>这份报告尚未采集完整，将保留现有数据和覆盖说明。</p>}
            <Button
              disabled={disabled || action.isPending || ['queued', 'running'].includes(task.status)}
              onClick={() => void save()}
            >
              {action.isPending ? '正在保存…' : '确认保存'}
            </Button>
          </>
        ) : (
          <Link
            className="text-link"
            to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
          >
            登录后保存报告
          </Link>
        )}
        {saved && (
          <p role="status">
            已保存。
            <Link className="text-link" to={`/archives/${saved.id}`}>
              查看存档
            </Link>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
