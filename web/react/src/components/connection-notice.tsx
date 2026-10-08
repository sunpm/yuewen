import { ApiError, api } from '@client/api'
import type { Connections, SaveResult } from '@shared/connection'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { message, queries, refreshConnections, stopPrivate, write } from '@/lib/business'

// A returned login intent is consumed once per page session. StrictMode/remounts
// observe that same operation; retries keep the server's original request ID.
const attempts = new Map<string, { promise: Promise<SaveResult>; listeners: Set<symbol> }>()
function saveIntent(key: string, requestId: string, reportId: string, expected?: unknown) {
  const existing = attempts.get(key)
  if (existing) return existing
  stopPrivate()
  const listeners = new Set<symbol>()
  const mutation = queries.getMutationCache().build(queries, {
    mutationFn: () =>
      write(() => {
        if (!listeners.size) throw new DOMException('保存意图已取消', 'AbortError')
        return api<SaveResult>('/guest/save', {
          method: 'POST',
          body: JSON.stringify({
            requestId,
            reportId,
            ...(expected ? { expected, replace: true } : {}),
          }),
        })
      }),
    gcTime: 0,
  })
  const attempt = { promise: mutation.execute(undefined), listeners }
  attempts.set(key, attempt)
  if (attempts.size > 8) attempts.delete(attempts.keys().next().value as string)
  return attempt
}
export function ConnectionNotice({
  taskId,
  connections,
  disabled,
}: {
  taskId?: string
  connections?: Connections
  disabled: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const requestId = params.get('save') ?? ''
  const reportId = params.get('saveReport') ?? ''
  const account = connections?.account?.context
  const intent = /^[\da-f-]{36}$/i.test(requestId) && /^[\da-f-]{36}$/i.test(reportId)
  const operationKey = `${account}:${requestId}:${reportId}`
  const [revision, setRevision] = useState(0)
  const expected = useRef<unknown>(undefined)
  const [state, setState] = useState<{ busy: boolean; error?: unknown; conflict?: unknown }>({
    busy: false,
  })
  useEffect(() => {
    if (!intent || !account) return
    let alive = true
    setState({ busy: true })
    const attempt = saveIntent(
      operationKey,
      requestId,
      reportId,
      revision ? expected.current : undefined,
    )
    const subscription = Symbol()
    attempt.listeners.add(subscription)
    void attempt.promise
      .then(async (saved) => {
        if (!alive) return
        const next = new URLSearchParams(location.search)
        next.set('connection', 'account')
        next.set('range', saved.range)
        next.delete('save')
        next.delete('saveReport')
        attempts.delete(operationKey)
        navigate(
          { pathname: location.pathname, search: `?${next}`, hash: location.hash },
          { replace: true },
        )
        await refreshConnections()
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          attempts.delete(operationKey)
        if (alive)
          setState({
            busy: false,
            error,
            conflict:
              error instanceof ApiError && error.code === 'SAVE_CONFLICT'
                ? error.details
                : undefined,
          })
      })
    return () => {
      alive = false
      attempt.listeners.delete(subscription)
    }
  }, [
    intent,
    account,
    operationKey,
    requestId,
    reportId,
    revision,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ])
  function begin() {
    if (!taskId || disabled) return
    stopPrivate()
    const next = new URLSearchParams(location.search)
    next.set('connection', 'guest')
    next.set('save', crypto.randomUUID())
    next.set('saveReport', taskId)
    const destination = `${location.pathname}?${next}`
    navigate(account ? destination : `/login?next=${encodeURIComponent(destination)}`, {
      replace: !!account,
    })
  }
  function keep() {
    attempts.delete(operationKey)
    const next = new URLSearchParams(location.search)
    next.delete('save')
    next.delete('saveReport')
    navigate({ pathname: location.pathname, search: `?${next}` }, { replace: true })
  }
  function retry(replace = false) {
    expected.current = replace ? state.conflict : undefined
    attempts.delete(operationKey)
    setRevision((value) => value + 1)
  }
  return (
    <aside className="connection-notice">
      <p>临时连接 · 闲置 30 分钟、最长 2 小时后清理。Key 在服务端加密暂存，报告可直接下载。</p>
      {state.busy && <p role="status">正在保存连接并确认原报告…</p>}
      {state.error != null && (
        <p role="alert">
          {state.error instanceof ApiError && state.error.code !== 'SERVICE_ERROR'
            ? message(state.error)
            : '保存结果尚未确认，请重试确认原保存结果。'}
        </p>
      )}
      {requestId && !intent && <p role="alert">保存参数不完整，请返回临时报告重新发起保存。</p>}
      <div className="connection-actions">
        {!requestId && (
          <Button variant="outline" disabled={disabled || !taskId} onClick={begin}>
            保存连接，下次直接查看
          </Button>
        )}
        {intent && !account && (
          <Link
            className="text-link"
            to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
          >
            登录后保存连接
          </Link>
        )}
        {intent &&
          account &&
          !state.busy &&
          (state.conflict ? (
            <Button onClick={() => retry(true)}>替换账号现有连接或临时报告，保存本次结果</Button>
          ) : state.error instanceof ApiError && state.error.code === 'SAVE_RESULT_EXPIRED' ? (
            <Link className="text-link" to="/settings?connection=account">
              连接已保存，使用账号连接
            </Link>
          ) : (
            <Button onClick={() => retry()}>重试确认保存结果</Button>
          ))}
        {!!requestId && (
          <Button variant="ghost" disabled={state.busy} onClick={keep}>
            {state.conflict ? '保留账号现状，继续临时查看' : '继续临时查看'}
          </Button>
        )}
        <Link
          className="text-link"
          to={`/settings?connection=guest&range=${encodeURIComponent(params.get('range') ?? 'recent')}`}
        >
          管理临时连接
        </Link>
        <Link
          className="text-link"
          to={`/settings?connection=account&range=${encodeURIComponent(params.get('range') ?? 'recent')}`}
        >
          使用账号连接
        </Link>
      </div>
    </aside>
  )
}
