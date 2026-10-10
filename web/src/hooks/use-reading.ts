import { ApiError, api } from '@client/api'
import type { Connection, ReportTask } from '@shared/connection'
import { createDemo } from '@shared/demo'
import {
  type Book,
  isRangeKey,
  type RangeKey,
  type ReadingReport,
  type ReportTarget,
} from '@shared/report'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import {
  errorCode,
  flow,
  gone,
  message,
  online,
  queries,
  request,
  stopPrivate,
  useAction,
  useConnections,
  write,
} from '@/lib/business'

type CachedTask = ReportTask & { deadline: number }
const cacheTask = (task: ReportTask): CachedTask => ({
  ...task,
  deadline:
    'deadline' in task && typeof task.deadline === 'number'
      ? task.deadline
      : performance.now() +
        Math.min(Date.parse(task.expiresAt), Date.parse(task.idleExpiresAt)) -
        Date.parse(task.serverTime),
})
const taskKey = (scope: string, task?: ReportTask) =>
  ['private', scope, 'report', task?.id ?? '', task?.keyVersion ?? 0, task?.version ?? 0] as const

export function useReading() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const demo = location.pathname.replace(/\/+$/, '') === '/demo'
  const development = import.meta.env.DEV && demo && params.get('source') === 'development'
  const sample = demo && !development
  const candidate = params.getAll('range').length === 1 ? params.get('range') : null
  const range: RangeKey = isRangeKey(candidate) ? candidate : 'recent'
  const connections = useConnections(!sample && !development)
  const developmentStatus = useQuery({
    queryKey: ['development-connection'],
    enabled: development,
    queryFn: ({ signal }) => {
      stopPrivate()
      return api('/dev/source', { signal, headers: { 'X-Yuewen-Local': '1' } })
    },
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })
  const selection = params.get('connection')
  const connection: Connection = selection === 'account' ? 'account' : 'guest'
  const owner = connections.data?.[connection]
  const access = development ? 'development' : connection
  const saving = !!params.get('save')
  const scope = `${access}:${owner?.context ?? 'none'}:${range}`
  const [pointer, setPointer] = useState<ReturnType<typeof taskKey>>(() => taskKey('pending'))
  const taskQuery = useQuery<CachedTask>({ queryKey: pointer, queryFn: skipToken })
  const currentKey = useRef(pointer)
  const currentRun = useRef(0)
  const [phase, setPhase] = useState<'collect' | 'notes'>('collect')
  const [restoring, setRestoring] = useState(false)
  const [restoredScope, setRestoredScope] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [conflict, setConflict] = useState<{ target: ReportTarget; requestId: string } | null>(null)
  const action = useAction()
  const taskAction = useAction()
  const local = useMemo(() => (sample ? createDemo(range) : null), [sample, range])
  const valid =
    (development && developmentStatus.isSuccess && !developmentStatus.isFetching) ||
    (!development &&
      !sample &&
      !connections.isFetching &&
      !connections.isError &&
      !!owner &&
      selection === connection)
  const task =
    valid && pointer[1] === scope && taskQuery.data && taskQuery.data.deadline > performance.now()
      ? taskQuery.data
      : null
  const report = local ?? task?.report

  useEffect(() => {
    if (
      !isRangeKey(candidate) ||
      (!sample &&
        !development &&
        connections.data &&
        !['guest', 'account'].includes(selection ?? ''))
    ) {
      const next = new URLSearchParams(params)
      if (!isRangeKey(candidate)) {
        next.set('range', 'recent')
        next.delete('month')
      }
      if (!sample && !development && !['guest', 'account'].includes(selection ?? ''))
        next.set(
          'connection',
          connections.data?.guest ? 'guest' : connections.data?.account ? 'account' : 'guest',
        )
      setParams(next, { replace: true })
    }
  }, [candidate, sample, development, connections.data, selection, params, setParams])

  function publish(value: ReportTask, run: number) {
    if (run !== flow.generation) throw new DOMException('读取已取消', 'AbortError')
    const current = queries.getQueryData<CachedTask>(currentKey.current)
    if (
      currentKey.current[1] === scope &&
      current?.id === value.id &&
      current.keyVersion === value.keyVersion &&
      current.version > value.version
    )
      throw new ApiError('REPORT_CHANGED', '报告已更新，请重新读取。')
    const key = taskKey(scope, value)
    const previous = queries.getQueryData<CachedTask>(key)
    const cached = cacheTask(value)
    if (previous) {
      // Same-version reads can finish out of order with renewal or note pagination.
      // Keep only progress already confirmed for this exact owner/task/version.
      if (previous.deadline > cached.deadline) {
        cached.deadline = previous.deadline
        cached.idleExpiresAt = previous.idleExpiresAt
      }
      if (previous.report.notes.length > cached.report.notes.length)
        cached.report = { ...cached.report, notes: previous.report.notes }
      cached.notesComplete ||= previous.notesComplete
    }
    if (!Number.isFinite(cached.deadline) || cached.deadline <= performance.now()) {
      const error = new ApiError('REPORT_EXPIRED', '临时报告已到期，请重新生成。')
      showError(error, run)
      throw error
    }
    queries.setQueryData(key, cached)
    currentKey.current = key
    setPointer(key)
    // Older report versions must not keep private text alive in the cache.
    queries.removeQueries({
      queryKey: ['private', scope, 'report'],
      predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(key),
    })
    return cached
  }
  function showError(value: unknown, run: number) {
    if (run !== flow.generation) return
    setError(value)
    if (gone(value)) {
      stopPrivate(true)
      setPointer(taskKey(scope))
    }
  }
  async function read<T>(path: string, key: readonly unknown[], run: number) {
    if (run !== flow.generation) throw new DOMException('读取已取消', 'AbortError')
    try {
      const result = await queries.fetchQuery({
        queryKey: ['private', scope, ...key],
        gcTime: 0,
        queryFn: ({ signal }) => {
          online()
          return request<T>(access, path, { signal })
        },
      })
      if (run !== flow.generation) throw new DOMException('读取已取消', 'AbortError')
      return result
    } catch (error) {
      // Details and downloads must invalidate the report too, not just their local panel.
      if (gone(error)) showError(error, run)
      throw error
    }
  }
  async function hydrate(value: ReportTask, run: number) {
    let next = publish(value, run)
    while (!next.notesComplete) {
      const cursor = next.report.notes.length
      const page = await read<{
        notes: ReadingReport['notes']
        nextCursor: number | null
        version: number
      }>(
        `/reports/${next.id}/notes?cursor=${cursor}`,
        ['notes', next.id, next.keyVersion, next.version, cursor],
        run,
      )
      if (page.version !== next.version || (page.nextCursor !== null && page.nextCursor <= cursor))
        throw new ApiError('REPORT_CHANGED', '报告已更新，请重新读取笔记。')
      next = publish(
        {
          ...next,
          report: { ...next.report, notes: [...next.report.notes, ...page.notes] },
          notesComplete: page.nextCursor === null,
        },
        run,
      )
    }
    return next
  }

  useEffect(() => {
    stopPrivate()
    const run = flow.generation
    currentRun.current = run
    setRestoredScope('')
    setPointer(taskKey(scope))
    setError(null)
    setConflict(null)
    setRestoring(valid && !saving)
    if (valid && !saving) {
      void (async () => {
        try {
          await flow.writes
          if (run !== flow.generation) return
          const list = await queries.fetchQuery({
            queryKey: ['private', scope, 'restore'],
            queryFn: ({ signal }) => request<ReportTask[]>(access, '/session/reports', { signal }),
          })
          if (run !== flow.generation) return
          const restored = list.find((item) => item.report.range.key === range)
          if (restored) {
            const cached = cacheTask(restored)
            if (!Number.isFinite(cached.deadline) || cached.deadline <= performance.now())
              throw new ApiError('REPORT_EXPIRED', '临时报告已到期，请重新生成。')
            const key = taskKey(scope, restored)
            queries.setQueryData(key, cached)
            currentKey.current = key
            setPointer(key)
          }
          queries.removeQueries({ queryKey: ['private', scope, 'restore'] })
        } catch (e) {
          if (run === flow.generation) setError(e)
        } finally {
          if (run === flow.generation) {
            setRestoring(false)
            setRestoredScope(scope)
          }
        }
      })()
    }
    return () => stopPrivate()
  }, [valid, scope, range, access, saving])

  useEffect(() => {
    if (!task) return
    const timer = window.setTimeout(
      () => {
        stopPrivate(true)
        setPointer(taskKey(scope))
        setError(new ApiError('REPORT_EXPIRED', '临时报告已到期，请重新生成。'))
      },
      Math.max(0, task.deadline - performance.now()),
    )
    return () => window.clearTimeout(timer)
  }, [task, scope])

  async function collect(fresh = false, confirmed = false) {
    if (!valid || saving || action.isPending || restoring) return
    setPhase('collect')
    const run = ++flow.generation
    currentRun.current = run
    setError(null)
    const replacement = confirmed ? conflict : null
    setConflict(null)
    await action
      .run(async () => {
        try {
          await flow.writes
          if (run !== flow.generation) return
          let next: ReportTask | undefined
          // Always recover first after an uncertain write, without silently creating another task.
          if (!fresh) {
            if (task)
              next = await read<ReportTask>(
                `/reports/${task.id}`,
                ['recover', task.id, task.keyVersion, task.version],
                run,
              )
            else {
              const list = await read<ReportTask[]>('/session/reports', ['recover'], run)
              next = list.find((item) => item.report.range.key === range)
            }
          }
          if (development && (!next || fresh)) {
            next = await write(() => {
              if (run !== flow.generation) throw new DOMException('操作已取消', 'AbortError')
              return request<ReportTask>('development', '/report', {
                method: 'POST',
                body: JSON.stringify({ range, fresh }),
              })
            })
          }
          if (!next) {
            const attempt = replacement
              ? {
                  scope,
                  key: range,
                  requestId: replacement.requestId,
                  expected: replacement.target,
                  replace: true,
                }
              : flow.pending?.scope === scope
                ? flow.pending
                : {
                    scope,
                    key: range,
                    requestId: crypto.randomUUID(),
                    expected: undefined,
                    replace: false,
                  }
            flow.pending = attempt
            attempt.expected ??= await read<ReportTarget>('/reports/target', ['target'], run)
            next = await write(() => {
              if (run !== flow.generation) throw new DOMException('操作已取消', 'AbortError')
              return request<ReportTask>(connection, '/reports', {
                method: 'POST',
                body: JSON.stringify({
                  range,
                  requestId: attempt.requestId,
                  expected: attempt.expected,
                  replace: attempt.replace,
                }),
              })
            })
            if (flow.pending === attempt) flow.pending = null
          }
          if (run !== flow.generation) return
          publish(next, run)
          while (next && ['queued', 'running'].includes(next.status) && run === flow.generation) {
            const previous: ReportTask = next
            next = await write(() => {
              if (run !== flow.generation) throw new DOMException('操作已取消', 'AbortError')
              return request<ReportTask>(
                access,
                development ? '/report' : `/reports/${previous.id}/advance`,
                {
                  method: 'POST',
                  body: JSON.stringify(
                    development
                      ? { range }
                      : { version: previous.version, requestId: crypto.randomUUID() },
                  ),
                },
              )
            })
            if (run !== flow.generation) return
            publish(next, run)
          }
          if (next && run === flow.generation) {
            if (!next.notesComplete) setPhase('notes')
            await hydrate(next, run)
          }
        } catch (e) {
          if (run !== flow.generation) return
          if (
            e instanceof ApiError &&
            ['REPORT_CONFLICT', 'REPORT_TARGET_CHANGED'].includes(e.code)
          ) {
            setConflict({
              target: e.details as ReportTarget,
              requestId: flow.pending?.requestId ?? crypto.randomUUID(),
            })
            flow.pending = null
          }
          showError(e, run)
        }
      })
      .catch((e) => showError(e, run))
  }

  const consumeIntent = useEffectEvent(() => {
    const intent = flow.intent
    if (!valid || restoring || saving || restoredScope !== scope || !intent) return
    if (
      intent.connection !== connection ||
      intent.range !== range ||
      intent.context !== owner?.context
    )
      return
    flow.intent = null
    void collect()
  })
  useEffect(() => {
    if (valid && !restoring && !saving && restoredScope === scope) consumeIntent()
  }, [valid, restoring, saving, restoredScope, scope])

  async function changeTask(kind: 'cancel' | 'retry') {
    if (!valid || saving || taskAction.isPending || (kind === 'retry' && !task)) return
    const run = ++flow.generation
    currentRun.current = run
    setError(null)
    if (kind === 'cancel' && phase === 'notes') {
      await queries.cancelQueries({ queryKey: ['private', scope] })
      setError(new Error('已停止补齐笔记，已读取的内容保留。'))
      return
    }
    if (!task) {
      setError(new Error('已停止发起后续采集，可重新读取服务端结果。'))
      return
    }
    try {
      await taskAction.run(async () => {
        const next = await write(() => {
          if (run !== flow.generation) throw new DOMException('操作已取消', 'AbortError')
          return request<ReportTask>(
            access,
            development ? '/report' : `/reports/${task.id}/${kind}`,
            {
              method: 'POST',
              ...(development ? { body: JSON.stringify({ range, action: kind }) } : {}),
            },
          )
        })
        publish(next, run)
      })
      if (kind === 'retry' && run === flow.generation) await collect()
    } catch (e) {
      showError(e, run)
    }
  }
  async function loadNotes() {
    if (!task || !valid || saving || action.isPending) return
    setPhase('notes')
    const run = flow.generation
    setError(null)
    try {
      await action.run(async () => {
        const latest = await read<ReportTask>(
          `/reports/${task.id}`,
          ['note-source', task.id, task.keyVersion, task.version],
          run,
        )
        await hydrate(latest, run)
      })
    } catch (e) {
      showError(e, run)
    }
  }
  async function completeReport(includeNotes: boolean) {
    if (local) return { report: local, id: 'sample', version: 0, keyVersion: 0 }
    if (!task || !valid || saving || action.isPending)
      throw new Error('请等待报告恢复或采集结束后再下载。')
    const run = flow.generation
    const latest = await read<ReportTask>(
      `/reports/${task.id}`,
      ['download', task.id, task.keyVersion, task.version],
      run,
    )
    const full = includeNotes ? await hydrate(latest, run) : publish(latest, run)
    // Recheck ownership/version after pagination, without touching or recollecting upstream data.
    const checked = await read<ReportTask>(`/reports/${task.id}`, ['download-check', task.id], run)
    if (checked.version !== full.version) throw new Error('报告已更新，请重新下载。')
    publish({ ...checked, report: full.report, notesComplete: full.notesComplete }, run)
    return full
  }
  async function bookDetail(id: string) {
    if (local) return local.books.find((book) => book.id === id) ?? {}
    if (!task || !valid || saving) throw new Error('请先恢复报告。')
    return read<Partial<Book>>(
      `/books/${encodeURIComponent(id)}`,
      ['book', task.id, task.keyVersion, task.version, id],
      flow.generation,
    )
  }
  const touched = useRef(0)
  async function touch() {
    if (
      development ||
      !task ||
      !valid ||
      saving ||
      action.isPending ||
      Date.now() - touched.current < 60_000
    )
      return
    touched.current = Date.now()
    const run = flow.generation
    try {
      await write(() => {
        if (run !== flow.generation) throw new DOMException('操作已取消', 'AbortError')
        return request(connection, `/reports/${task.id}/touch`, { method: 'POST' })
      })
      const next = await read<ReportTask>(`/reports/${task.id}`, ['touch', task.id], run)
      publish(next, run)
    } catch (e) {
      showError(e, run)
    }
  }
  return {
    sample,
    development,
    connection,
    connections,
    range,
    report,
    task,
    valid,
    saving,
    phase,
    restoring:
      restoring || (development ? developmentStatus.isFetching : !sample && connections.isFetching),
    busy: (action.isPending || taskAction.isPending) && currentRun.current === flow.generation,
    error: error ?? (development ? developmentStatus.error : sample ? null : connections.error),
    errorMessage: error
      ? message(error)
      : development
        ? developmentStatus.error
          ? message(developmentStatus.error)
          : ''
        : !sample && connections.error
          ? message(connections.error)
          : '',
    errorCode: errorCode(error),
    conflict,
    collect,
    changeTask,
    completeReport,
    loadNotes,
    bookDetail,
    touch,
    dismissConflict: () => {
      setConflict(null)
      flow.pending = null
      setError(new Error('已取消生成，原临时报告保持不变。'))
    },
  }
}
