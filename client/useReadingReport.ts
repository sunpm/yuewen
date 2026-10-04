import { computed, ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Book, RangeKey } from '@shared/report'
import { getRange, isRangeKey, shanghaiDate } from '@shared/report'
import { createDemo } from '@shared/demo'
import { useReport } from './useReport'
import type { ReportTask } from './useReport'
import { api, ApiError } from './api'
import { useConnection } from './useConnection'

export function useReadingReport(demo: Ref<boolean>) {
  const personal = useReport()
  const { connection } = useConnection()
  const route = useRoute(),
    router = useRouter()
  const range = computed<RangeKey>({
    get: () => (isRangeKey(route.query.range) ? route.query.range : 'recent'),
    set: (key) => {
      void router.push({ query: { ...route.query, range: key, month: undefined } })
    },
  })
  const years = computed(() => {
    const year = Number(shanghaiDate().slice(0, 4))
    return [
      ...new Set([
        year,
        year - 1,
        year - 2,
        ...(/^\d{4}$/.test(range.value) ? [Number(range.value)] : []),
      ]),
    ].sort((a, b) => b - a)
  })
  watch(
    () => route.query.range,
    (key) => {
      if (!isRangeKey(key))
        void router.replace({ query: { ...route.query, range: 'recent', month: undefined } })
    },
    { immediate: true },
  )
  const source = computed(() =>
    !demo.value
      ? (connection.value ?? 'pending')
      : import.meta.env.DEV && route.query.source !== 'mock'
        ? 'development'
        : 'sample',
  )
  const localTask = shallowRef<ReportTask | null>(null)
  const localBusy = ref(false),
    localError = ref(''),
    localCode = ref('')
  const simulated = computed(() => createDemo(range.value))
  const task = computed(() => {
    const current = ['account', 'guest'].includes(source.value)
      ? personal.task.value
      : localTask.value
    return current?.report.range.key === range.value ? current : null
  })
  const report = computed(() => (source.value === 'sample' ? simulated.value : task.value?.report))
  const busy = computed(() =>
    ['account', 'guest'].includes(source.value) ? personal.busy.value : localBusy.value,
  )
  const error = computed(() =>
    ['account', 'guest'].includes(source.value) ? personal.error.value : localError.value,
  )
  const errorCode = computed(() =>
    ['account', 'guest'].includes(source.value) ? personal.errorCode.value : localCode.value,
  )
  const isSample = computed(() => source.value === 'sample')
  const displayRange = computed(() => report.value?.range ?? getRange(range.value))
  const collectionStatus = computed(() => {
    if (busy.value)
      return task.value &&
        !['queued', 'running'].includes(task.value.status) &&
        !task.value.notesComplete
        ? '正在补齐笔记'
        : '正在读取'
    if (['account', 'guest'].includes(source.value) && personal.conflict.value)
      return '等待替换确认'
    if (error.value) return '读取未完成'
    if (isSample.value) return '已完成'
    if (!task.value) return '尚未读取'
    if (task.value.status === 'failed') return '读取失败'
    if (['cancelled', 'running', 'queued'].includes(task.value.status)) return '已停止'
    if (!task.value.notesComplete) return '笔记待补齐'
    return report.value?.coverage.complete ? '已完成' : '部分数据'
  })
  const sourceLabel = computed(
    () =>
      ({
        account: '账号连接',
        guest: '临时连接',
        pending: '正在恢复连接',
        development: '本地开发数据',
        sample: '模拟示例',
      })[source.value],
  )
  const canUseDevelopment = import.meta.env.DEV
  let generation = 0
  const headers = { 'X-Yuewen-Local': '1' }
  function suspend() {
    generation++
    localBusy.value = false
    personal.suspend()
  }
  async function collect(key: RangeKey, fresh = false, action?: string, automatic = false) {
    if (route.query.save) return
    if (['account', 'guest'].includes(source.value))
      return personal.collect(key, fresh, false, automatic)
    if (['sample', 'pending'].includes(source.value)) return
    const run = ++generation
    localBusy.value = true
    localError.value = ''
    localCode.value = ''
    if (fresh || localTask.value?.report.range.key !== key) localTask.value = null
    let waits = 0
    try {
      do {
        let next: ReportTask
        try {
          next = await api<ReportTask>('/dev/report', {
            method: 'POST',
            headers,
            body: JSON.stringify({ range: key, fresh, action }),
          })
        } catch (e) {
          if (
            e instanceof ApiError &&
            e.code === 'REPORT_BUSY' &&
            waits++ < 30 &&
            run === generation
          ) {
            await new Promise((resolve) => setTimeout(resolve, 500))
            if (run !== generation) return
            continue
          }
          throw e
        }
        if (run !== generation) return
        localTask.value = next
        if (next.issueCode) {
          localCode.value = next.issueCode
          localError.value = next.report.issues[0] ?? '采集已停止，已有结果可下载。'
        }
        fresh = false
        action = undefined
      } while (run === generation && (!localTask.value || localTask.value.status === 'running'))
    } catch (e) {
      if (run !== generation) return
      if (e instanceof ApiError && e.code === 'DEV_MOCK_MODE') {
        await router.replace({ query: { ...route.query, source: 'mock' } })
        return
      }
      localError.value = e instanceof Error ? e.message : '读取失败，请重试。'
      localCode.value = e instanceof ApiError ? e.code : ''
    } finally {
      if (run === generation) localBusy.value = false
    }
  }
  async function cancel() {
    if (['account', 'guest'].includes(source.value)) return personal.cancel()
    suspend()
  }
  async function retry() {
    if (['account', 'guest'].includes(source.value)) return personal.retry()
    return collect(range.value, false, 'retry')
  }
  function touch() {
    if (!route.query.save && ['account', 'guest'].includes(source.value)) void personal.touch()
  }
  const bookDetail = (id: string) =>
    api<Partial<Book>>(
      `${source.value === 'development' ? '/dev' : ''}/books/${encodeURIComponent(id)}`,
      {
        headers:
          source.value === 'development'
            ? headers
            : { 'X-Yuewen-Connection': connection.value ?? 'guest' },
      },
    )
  function switchSample() {
    return router.replace({
      query: { ...route.query, source: isSample.value ? undefined : 'mock' },
    })
  }
  watch(
    [source, range, () => route.query.save],
    () => {
      suspend()
      localTask.value = null
      localError.value = ''
      localCode.value = ''
      if (personal.conflict.value)
        personal.conflict.value = { ...personal.conflict.value, key: range.value }
      if (!route.query.save) void collect(range.value, false, undefined, true)
    },
    { immediate: true },
  )
  function checkVisibleReport() {
    if (
      !route.query.save &&
      document.visibilityState === 'visible' &&
      ['account', 'guest'].includes(source.value)
    )
      void personal.touch(true)
  }
  onMounted(() => document.addEventListener('visibilitychange', checkVisibleReport))
  onBeforeUnmount(() => {
    suspend()
    document.removeEventListener('visibilitychange', checkVisibleReport)
  })
  return {
    range,
    displayRange,
    collectionStatus,
    years,
    conflict: computed(() =>
      ['account', 'guest'].includes(source.value) ? personal.conflict.value : null,
    ),
    confirmReplacement: personal.confirmReplacement,
    dismissConflict: personal.dismissConflict,
    task,
    report,
    busy,
    error,
    errorCode,
    collect,
    cancel,
    retry,
    touch,
    isSample,
    source,
    sourceLabel,
    bookDetail,
    switchSample,
    canUseDevelopment,
  }
}
