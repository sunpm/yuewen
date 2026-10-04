import { ref, shallowRef } from 'vue'
import type { RangeKey, ReadingReport, ReportTarget } from '@shared/report'
import { api, ApiError } from '@client/api'
export interface ReportTask {
  id: string
  version: number
  status: 'queued' | 'running' | 'completed' | 'partial' | 'cancelled' | 'failed'
  stage: string
  report: ReadingReport
  keyVersion: number
  noteTotal: number
  notesComplete: boolean
}
const task = shallowRef<ReportTask | null>(null)
const busy = ref(false),
  error = ref(''),
  errorCode = ref('')
let generation = 0,
  touchedAt = 0
const conflict = shallowRef<{ key: RangeKey; target: ReportTarget; requestId: string } | null>(null)
let halted = false
// Keep report writes ordered even when navigation invalidates their UI response.
let updating: Promise<unknown> = Promise.resolve()
let pending: {
  key: RangeKey
  requestId: string
  expected?: ReportTarget
  replace?: boolean
} | null = null
export function useReport() {
  const showError = (e: unknown) => {
    error.value = e instanceof Error ? e.message : '读取失败，请重试。'
    errorCode.value = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (
      ['AUTH_REQUIRED', 'KEY_CHANGED', 'REPORT_EXPIRED', 'REPORT_REPLACED'].includes(
        errorCode.value,
      )
    )
      task.value = null
    if (errorCode.value === 'REPORT_REPLACED') {
      halted = true
      conflict.value = null
      pending = null
    }
  }
  const suspend = () => {
    generation++
    busy.value = false
  }
  const clear = () => {
    generation++
    task.value = null
    busy.value = false
    error.value = ''
    errorCode.value = ''
    touchedAt = 0
    halted = false
    conflict.value = null
    pending = null
  }
  const touch = async (force = false) => {
    if (!task.value || (!force && Date.now() - touchedAt < 60000)) return
    const current = task.value,
      run = generation
    touchedAt = Date.now()
    try {
      await api(`/reports/${current.id}/touch`, { method: 'POST' })
    } catch (e) {
      if (run === generation && task.value?.id === current.id) {
        suspend()
        showError(e)
      }
    }
  }
  const collect = async (key: RangeKey, fresh = false, confirmed = false, automatic = false) => {
    if (automatic && halted) return
    const confirmation = confirmed ? conflict.value : null
    const run = ++generation
    halted = false
    conflict.value = null
    busy.value = true
    error.value = ''
    errorCode.value = ''
    try {
      await updating.catch(() => {})
      if (run !== generation) return
      if (task.value && !confirmed) {
        const current = await api<ReportTask>(`/reports/${task.value.id}`)
        if (run !== generation) return
        task.value = current.report.range.key === key ? current : null
      }
      if (!task.value && !fresh) {
        const cached = await api<ReportTask[]>('/session/reports')
        if (run !== generation) return
        task.value = cached.find((t) => t.report.range.key === key) ?? null
      }
      if (!task.value || task.value.report.range.key !== key || fresh) {
        task.value = null
        // Serialize creation across route remounts; obsolete runs never post after a newer run.
        const creation = updating
          .catch(() => {})
          .then(async () => {
            if (run !== generation) return
            const attempt = confirmation
              ? {
                  key,
                  requestId: confirmation.requestId,
                  expected: confirmation.target,
                  replace: true,
                }
              : pending?.key === key
                ? pending
                : { key, requestId: crypto.randomUUID() }
            pending = attempt
            attempt.expected ??= await api<ReportTarget>('/reports/target')
            if (run !== generation) return
            const created = await api<ReportTask>('/reports', {
              method: 'POST',
              body: JSON.stringify({ range: key, ...attempt }),
            })
            // A successful obsolete run must not leave its ID for a later fresh request.
            if (pending === attempt) pending = null
            return created
          })
        updating = creation
        const created = await creation
        if (run !== generation) return
        task.value = created ?? null
      } else pending = null
      while (
        run === generation &&
        task.value &&
        ['queued', 'running'].includes(task.value.status)
      ) {
        const advancement = api<ReportTask>(`/reports/${task.value.id}/advance`, {
          method: 'POST',
          body: JSON.stringify({ version: task.value.version, requestId: crypto.randomUUID() }),
        })
        updating = advancement
        const next = await advancement
        if (run !== generation) return
        task.value = next
      }
      if (task.value && !task.value.notesComplete && run === generation) {
        const id = task.value.id,
          version = task.value.version
        let cursor: number | null = task.value.report.notes.length
        while (cursor !== null && run === generation) {
          const page: {
            notes: ReadingReport['notes']
            nextCursor: number | null
            version: number
          } = await api(`/reports/${id}/notes?cursor=${cursor}`)
          if (run !== generation) return
          if (!task.value || task.value.id !== id || page.version !== version)
            throw new Error('报告已更新，请重新加载笔记。')
          if (page.nextCursor !== null && page.nextCursor <= cursor)
            throw new Error('笔记分页异常，请重试。')
          task.value = {
            ...task.value,
            report: { ...task.value.report, notes: [...task.value.report.notes, ...page.notes] },
            notesComplete: page.nextCursor === null,
          }
          cursor = page.nextCursor
        }
      }
    } catch (e) {
      if (run !== generation) return
      if (e instanceof ApiError && ['REPORT_CONFLICT', 'REPORT_TARGET_CHANGED'].includes(e.code)) {
        const target = e.details as ReportTarget
        conflict.value = { key, target, requestId: pending?.requestId ?? crypto.randomUUID() }
        pending = null
        halted = true
      }
      showError(e)
    } finally {
      if (run === generation) busy.value = false
    }
  }
  const confirmReplacement = () => {
    if (conflict.value) return collect(conflict.value.key, true, true)
  }
  const dismissConflict = () => {
    conflict.value = null
    pending = null
    halted = true
    error.value = '已取消生成，原临时报告保持不变。'
    errorCode.value = 'REPORT_CANCELLED'
  }
  const cancel = async () => {
    const current = task.value,
      run = ++generation
    busy.value = false
    if (!current) return
    try {
      await updating.catch(() => {})
      if (run !== generation) return
      const cancellation = api<ReportTask>(`/reports/${current.id}/cancel`, { method: 'POST' })
      updating = cancellation
      const next = await cancellation
      if (run !== generation) return
      task.value = next
      await collect(next.report.range.key)
    } catch (e) {
      if (run === generation) showError(e)
    }
  }
  const retry = async () => {
    const current = task.value,
      run = ++generation
    if (!current) return
    try {
      await updating.catch(() => {})
      if (run !== generation) return
      const retrying = api<ReportTask>(`/reports/${current.id}/retry`, { method: 'POST' })
      updating = retrying
      const next = await retrying
      if (run !== generation) return
      task.value = next
      await collect(next.report.range.key)
    } catch (e) {
      if (run === generation) showError(e)
    }
  }
  return {
    task,
    busy,
    error,
    errorCode,
    conflict,
    confirmReplacement,
    dismissConflict,
    collect,
    cancel,
    retry,
    clear,
    suspend,
    touch,
  }
}
