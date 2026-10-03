import { computed, ref, shallowRef, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Book, RangeKey } from '@shared/report'
import { createDemo } from '@shared/demo'
import { useReport } from './useReport'
import type { ReportTask } from './useReport'
import { api, ApiError } from './api'

export function useReadingReport(demo: Ref<boolean>) {
  const personal = useReport()
  const route = useRoute(),
    router = useRouter()
  const range = ref<RangeKey>(
    !demo.value && personal.task.value ? personal.task.value.report.range.key : 'recent',
  )
  const source = computed(() =>
    !demo.value
      ? 'account'
      : import.meta.env.DEV && route.query.source !== 'mock'
        ? 'development'
        : 'sample',
  )
  const localTask = shallowRef<ReportTask | null>(null)
  const localBusy = ref(false),
    localError = ref(''),
    localCode = ref('')
  const simulated = computed(() => createDemo(range.value))
  const task = computed(() => (source.value === 'account' ? personal.task.value : localTask.value))
  const report = computed(() => (source.value === 'sample' ? simulated.value : task.value?.report))
  const busy = computed(() => (source.value === 'account' ? personal.busy.value : localBusy.value))
  const error = computed(() =>
    source.value === 'account' ? personal.error.value : localError.value,
  )
  const errorCode = computed(() =>
    source.value === 'account' ? personal.errorCode.value : localCode.value,
  )
  const isSample = computed(() => source.value === 'sample')
  const sourceLabel = computed(
    () =>
      ({ account: '我的阅读档案', development: '本地开发数据', sample: '模拟示例' })[source.value],
  )
  const canUseDevelopment = import.meta.env.DEV
  let generation = 0
  const headers = { 'X-Yuewen-Local': '1' }
  function suspend() {
    generation++
    localBusy.value = false
    personal.suspend()
  }
  async function collect(key: RangeKey, fresh = false, action?: string) {
    if (source.value === 'account') return personal.collect(key, fresh)
    if (source.value === 'sample') return
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
    if (source.value === 'account') return personal.cancel()
    suspend()
  }
  async function retry() {
    if (source.value === 'account') return personal.retry()
    return collect(range.value, false, 'retry')
  }
  function touch() {
    if (source.value === 'account') void personal.touch()
  }
  const bookDetail = (id: string) =>
    api<Partial<Book>>(
      `${source.value === 'development' ? '/dev' : ''}/books/${encodeURIComponent(id)}`,
      { headers: source.value === 'development' ? headers : {} },
    )
  function switchSample() {
    return router.replace({
      query: { ...route.query, source: isSample.value ? undefined : 'mock' },
    })
  }
  watch(
    [source, range],
    () => {
      suspend()
      localTask.value = null
      localError.value = ''
      localCode.value = ''
      void collect(range.value)
    },
    { immediate: true },
  )
  onUnmounted(suspend)
  return {
    range,
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
