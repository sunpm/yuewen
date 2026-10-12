import { ApiError, api } from '@client/api'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const auth = createAuthClient({
  basePath: '/api/console/auth',
  plugins: [usernameClient({ displayUsername: false })],
  sessionOptions: { refetchOnWindowFocus: false },
})
export const queries = new QueryClient({
  queryCache: new QueryCache({ onError: handleConsoleError }),
  mutationCache: new MutationCache({ onError: handleConsoleError }),
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 300_000,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      networkMode: 'always',
    },
    mutations: { retry: false, gcTime: 0, networkMode: 'always' },
  },
})

function handleConsoleError(error: unknown) {
  if (error instanceof ApiError && ['CONSOLE_AUTH_REQUIRED', 'FORBIDDEN'].includes(error.code)) {
    clearConsoleCache()
    auth.$store.notify('$sessionSignal')
  }
}

export function clearConsoleCache(keepSessionId?: string) {
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      !keepSessionId || query.queryKey[1] !== keepSessionId,
  }
  void queries.cancelQueries(filters)
  queries.removeQueries(filters)
  queries.getMutationCache().clear()
}

export function consoleRequest<T>(path: string, signal: AbortSignal) {
  requireOnline()
  return api<T>(`/console${path}`, { signal })
}

export function requireOnline() {
  if (!navigator.onLine) throw new Error('当前离线，请联网后主动重试。')
}
