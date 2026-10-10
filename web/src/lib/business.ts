import { ApiError, api } from '@client/api'
import type { Connection, Connections } from '@shared/connection'
import type { RangeKey, ReportTarget } from '@shared/report'
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { useEffect, useRef } from 'react'
import { clearViews } from '@/lib/view-memory'

export const auth = createAuthClient({ plugins: [emailOTPClient()] })
export const queries = new QueryClient({
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

// Only control tokens live here. All server data lives in the PC QueryClient.
export const flow = {
  generation: 0,
  writes: Promise.resolve() as Promise<unknown>,
  intent: null as null | { connection: Connection; range: RangeKey; context: string },
  pending: null as null | {
    scope: string
    key: RangeKey
    requestId: string
    expected?: ReportTarget
    replace?: boolean
  },
}
export function stopPrivate(clearViewState = false) {
  if (clearViewState) {
    clearViews()
    flow.pending = null
    flow.intent = null
  }
  flow.generation++
  void queries.cancelQueries({ queryKey: ['private'] })
  queries.removeQueries({ queryKey: ['private'] })
}
export function online() {
  if (!navigator.onLine) throw new ApiError('OFFLINE', '当前离线，请联网后主动重试。')
}
export async function write<T>(operation: () => Promise<T>): Promise<T> {
  online()
  const next = flow.writes
    .catch(() => {})
    .then(() => {
      online()
      return operation()
    })
  flow.writes = next.catch(() => {})
  return next
}
export async function request<T>(
  connection: Connection | 'development',
  path: string,
  options: RequestInit = {},
) {
  const started = performance.now()
  const value = await api<T>(connection === 'development' ? `/dev${path}` : path, {
    ...options,
    headers: {
      ...options.headers,
      ...(connection === 'development'
        ? { 'X-Yuewen-Local': '1' }
        : { 'X-Yuewen-Connection': connection }),
    },
  })
  // Use the request start, never the end of pagination, as a conservative clock
  // anchor. Reading cached pages cannot extend the server's original deadline.
  for (const item of Array.isArray(value) ? value : [value]) {
    if (
      item &&
      typeof item === 'object' &&
      'expiresAt' in item &&
      'idleExpiresAt' in item &&
      'serverTime' in item
    ) {
      Object.assign(item, {
        deadline:
          started +
          Math.min(Date.parse(String(item.expiresAt)), Date.parse(String(item.idleExpiresAt))) -
          Date.parse(String(item.serverTime)),
      })
    }
  }
  return value
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : '服务暂时无法连接，请重试。'
export const errorCode = (error: unknown) => (error instanceof ApiError ? error.code : '')
export const gone = (error: unknown) =>
  ['AUTH_REQUIRED', 'GUEST_EXPIRED', 'KEY_CHANGED', 'REPORT_EXPIRED', 'REPORT_REPLACED'].includes(
    errorCode(error),
  )

export function useConnections(enabled = true) {
  return useQuery({
    queryKey: ['connections'],
    enabled,
    queryFn: async ({ signal }) => {
      stopPrivate()
      await flow.writes
      online()
      const previous = queries.getQueryData<Connections>(['connections'])
      const next = await api<Connections>('/connections', { signal })
      if (
        previous?.guest?.context !== next.guest?.context ||
        previous?.account?.context !== next.account?.context
      )
        clearViews()
      return next
    },
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })
}
export async function refreshConnections() {
  stopPrivate(true)
  await queries.invalidateQueries({ queryKey: ['connections'] })
}

// Mutation variables never contain passwords, Keys, OTPs or captured form closures.
export function useAction() {
  const operation = useRef<(() => Promise<void>) | null>(null)
  const live = useRef(true)
  const mutation = useMutation({
    mutationFn: async () => {
      online()
      try {
        await operation.current?.()
      } finally {
        operation.current = null
      }
    },
  })
  const { reset, mutateAsync } = mutation
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      operation.current = null
      reset()
    }
  }, [reset])
  return {
    ...mutation,
    run: async (action: () => Promise<void>) => {
      if (operation.current) return
      operation.current = action
      try {
        await mutateAsync()
      } finally {
        operation.current = null
        if (!live.current) reset()
      }
    },
  }
}
