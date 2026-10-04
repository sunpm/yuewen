import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from './api'
import { useReport } from './useReport'
export type Connection = 'guest' | 'account'
export interface Connections {
  guest: { status: string; expiresAt: string; idleExpiresAt: string } | null
  account: { status: string } | null
}
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
    async (value) => {
      if (route.path === '/demo') return
      if (value) {
        personal.selectConnection(value)
        return
      }
      const path = route.fullPath
      try {
        const available = await api<Connections>('/connections')
        if (route.fullPath !== path) return
        await router.replace({
          query: {
            ...route.query,
            connection: available.guest ? 'guest' : available.account ? 'account' : 'guest',
          },
        })
      } catch {
        if (route.fullPath === path)
          await router.replace({ query: { ...route.query, connection: 'guest' } })
      }
    },
    { immediate: true, flush: 'sync' },
  )
  return { connection }
}
export function safeReturn(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return '/settings?connection=account'
  const url = new URL(value, 'https://return.invalid')
  const path = url.pathname.replace(/^\/m\//, '/')
  if (!['/overview', '/report', '/shelf', '/notes', '/settings'].includes(path))
    return '/settings?connection=account'
  const params = new URLSearchParams()
  for (const key of ['range', 'view', 'book', 'month', 'connection', 'save', 'saveReport']) {
    const item = url.searchParams.get(key)
    if (item) params.set(key, item)
  }
  return path + (params.size ? `?${params}` : '')
}
