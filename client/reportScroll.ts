import type { RouterScrollBehavior } from 'vue-router'
import { nextTick, ref, watch } from 'vue'
import { isRangeKey } from '@shared/report'
import { reportIsLoading } from './useReportViewState'

const navigation = ref(0)

export const reportScroll: RouterScrollBehavior = async (to, from, saved) => {
  const current = ++navigation.value
  if (saved) {
    if (reportIsLoading())
      await new Promise<void>((resolve) => {
        const stop = watch(
          [reportIsLoading, navigation],
          ([loading, latest]) => {
            if (!loading || latest !== current) {
              stop()
              resolve()
            }
          },
          { flush: 'post' },
        )
      })
    await nextTick()
    return current === navigation.value ? saved : false
  }
  if (to.path !== from.path) return { top: 0 }
  const keys = ['view', 'source', 'book', 'month', 'connection', 'range']
  const changed = keys.filter((key) => to.query[key] !== from.query[key])
  if (
    !isRangeKey(from.query.range) &&
    to.query.range === 'recent' &&
    changed.every((key) => key === 'range' || (key === 'month' && !to.query.month))
  )
    return false
  return changed.length ? { top: 0 } : false
}
