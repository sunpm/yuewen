import { ref, shallowRef } from 'vue'
import type { RangeKey, ReadingReport } from '@shared/report'
import { api } from '@client/api'
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
export function useReport() {
  const showError = (e: unknown) => {
    error.value = e instanceof Error ? e.message : '读取失败，请重试。'
    errorCode.value = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
    if (['AUTH_REQUIRED', 'KEY_CHANGED', 'REPORT_EXPIRED'].includes(errorCode.value))
      task.value = null
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
  }
  const touch = async () => {
    if (!task.value || Date.now() - touchedAt < 60000) return
    touchedAt = Date.now()
    try {
      await api(`/reports/${task.value.id}/touch`, { method: 'POST' })
    } catch (e) {
      showError(e)
    }
  }
  const collect = async (key: RangeKey, fresh = false) => {
    const run = ++generation
    busy.value = true
    error.value = ''
    errorCode.value = ''
    if (task.value?.report.range.key !== key) task.value = null
    try {
      if (task.value && !fresh) {
        const current = await api<ReportTask>(`/reports/${task.value.id}`)
        if (run !== generation) return
        task.value = current
      }
      if (!task.value && !fresh) {
        const cached = await api<ReportTask[]>('/session/reports')
        if (run !== generation) return
        task.value = cached.find((t) => t.report.range.key === key) ?? null
      }
      if (!task.value || task.value.report.range.key !== key || fresh) {
        const created = await api<ReportTask>('/reports', {
          method: 'POST',
          body: JSON.stringify({ range: key, requestId: crypto.randomUUID() }),
        })
        if (run !== generation) return
        task.value = created
      }
      while (
        run === generation &&
        task.value &&
        ['queued', 'running'].includes(task.value.status)
      ) {
        const next: ReportTask = await api<ReportTask>(`/reports/${task.value.id}/advance`, {
          method: 'POST',
          body: JSON.stringify({ version: task.value.version, requestId: crypto.randomUUID() }),
        })
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
      showError(e)
    } finally {
      if (run === generation) busy.value = false
    }
  }
  const cancel = async () => {
    const current = task.value,
      run = ++generation
    busy.value = false
    if (!current) return
    try {
      const next = await api<ReportTask>(`/reports/${current.id}/cancel`, { method: 'POST' })
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
      const next = await api<ReportTask>(`/reports/${current.id}/retry`, { method: 'POST' })
      if (run !== generation) return
      task.value = next
      await collect(next.report.range.key)
    } catch (e) {
      if (run === generation) showError(e)
    }
  }
  return { task, busy, error, errorCode, collect, cancel, retry, clear, suspend, touch }
}
