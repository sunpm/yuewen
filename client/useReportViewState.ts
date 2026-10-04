import { onScopeDispose, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

let reading: Ref<boolean> | undefined

export function reportIsLoading() {
  return reading?.value ?? false
}

export function useReportViewState(
  fields: Record<string, Ref<string | number | boolean>>,
  busy: Ref<boolean>,
) {
  const route = useRoute(),
    router = useRouter(),
    history = router.options.history
  reading = busy
  onScopeDispose(() => {
    if (reading === busy) reading = undefined
  })
  watch(
    () => route.fullPath,
    () => {
      const saved = history.state.reportView
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return
      if (saved.path !== route.fullPath) return
      // Restore filters before the limit: changing a filter resets pagination.
      for (const [key, field] of Object.entries(fields)) {
        const value = saved[key]
        if (typeof value === typeof field.value) field.value = value as string | number | boolean
      }
    },
    { immediate: true },
  )
  watch(
    Object.values(fields),
    () => {
      // Only view controls live in this history entry; report content stays in memory.
      history.replace(route.fullPath, {
        ...history.state,
        reportView: {
          path: route.fullPath,
          ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])),
        },
      })
    },
    { flush: 'post' },
  )
}
