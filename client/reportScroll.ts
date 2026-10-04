import type { RouterScrollBehavior } from 'vue-router'
import { isRangeKey } from '@shared/report'

export const reportScroll: RouterScrollBehavior = (to, from, saved) => {
  if (saved) return saved
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
