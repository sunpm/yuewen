import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from './api'
import { useReport } from './useReport'
import type { Connection, Connections } from '@shared/connection'
export type { Connection, Connections } from '@shared/connection'
export function useConnection() {
  const route = useRoute(),
    router = useRouter()
  const connection = computed<Connection | null>(() =>
    route.query.connection === 'guest' || route.query.connection === 'account'
      ? route.query.connection
      : null,
  )
  const personal = useReport()
  watch(
    connection,
    async (value, _previous, onCleanup) => {
      let active = true
      onCleanup(() => (active = false))
      if (route.path === '/demo') return
      if (value) {
        personal.selectConnection(value)
        return
      }
      const path = route.path
      try {
        const available = await api<Connections>('/connections')
        if (!active || route.path !== path || connection.value) return
        await router.replace({
          query: {
            ...route.query,
            connection: available.guest ? 'guest' : available.account ? 'account' : 'guest',
          },
        })
      } catch {
        if (active && route.path === path && !connection.value)
          await router.replace({ query: { ...route.query, connection: 'guest' } })
      }
    },
    { immediate: true, flush: 'sync' },
  )
  return { connection }
}
export { safeReturn } from './returnPath'
