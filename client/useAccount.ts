import { ref, watch, computed, onScopeDispose } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '@client/api'
import { authClient } from '@client/auth'
import { useReport } from '@client/useReport'
import { useConnection, safeReturn } from './useConnection'
import type { Connections } from './useConnection'
export function useAccount() {
  const route = useRoute()
  const { connection } = useConnection()
  const guest = computed(() => connection.value !== 'account')
  const router = useRouter(),
    { clear } = useReport()
  const key = ref(''),
    show = ref(false),
    busy = ref(false),
    message = ref(''),
    error = ref(
      route.query.expired === 'GUEST_EXPIRED'
        ? '临时连接已到期或清除，请重新输入 Key。'
        : route.query.expired === 'AUTH_REQUIRED'
          ? '账号登录已过期，请登录恢复连接，或另用临时连接。'
          : '',
    )
  const state = ref<{ status: 'missing' | 'valid' | 'invalid'; updatedAt?: string }>()
  const confirmation = ref('')
  let generation = 0
  watch(
    () => route.fullPath,
    () => {
      generation++
      busy.value = false
      key.value = ''
      confirmation.value = ''
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    generation++
    key.value = ''
  })
  watch(
    connection,
    async (selected, _previous, onCleanup) => {
      let active = true
      onCleanup(() => (active = false))
      if (!selected) return
      state.value = undefined
      key.value = ''
      message.value = ''
      if (!route.query.expired) error.value = ''
      try {
        const available = await api<Connections>('/connections')
        if (!active) return
        state.value = {
          status: (available[selected]?.status ?? 'missing') as 'missing' | 'valid' | 'invalid',
        }
      } catch (e) {
        if (active) error.value = e instanceof Error ? e.message : '设置暂时无法加载。'
      }
    },
    { immediate: true },
  )
  async function save() {
    if (busy.value) return
    const run = generation
    const selected = connection.value
    if (!selected) return
    busy.value = true
    error.value = ''
    message.value = ''
    try {
      const result = await api<NonNullable<typeof state.value>>(
        selected === 'guest' ? '/guest/connection' : '/account/weread-key',
        {
          method: 'PUT',
          body: JSON.stringify({ apiKey: key.value }),
        },
      )
      if (run !== generation) return
      state.value = result
      key.value = ''
      clear()
      message.value = guest.value ? '临时连接已建立。' : '微信读书已连接，Key 已加密保存。'
      const next = safeReturn(route.query.next ?? '/overview')
      const target = router.resolve(next)
      await router.push({
        path: target.path,
        query: {
          ...target.query,
          range: target.query.range ?? route.query.range,
          connection: connection.value ?? 'guest',
        },
      })
    } catch (e) {
      if (run === generation) error.value = e instanceof Error ? e.message : '保存失败。'
    } finally {
      if (run === generation) {
        key.value = ''
        busy.value = false
      }
    }
  }
  async function action(type: 'cache' | 'key' | 'logout' | 'account') {
    if (busy.value) return
    const run = generation
    busy.value = true
    error.value = ''
    message.value = ''
    try {
      if (type === 'logout') {
        const result = await authClient.signOut()
        if (result.error) throw new Error('退出失败，请重试。')
      } else
        await api(
          type === 'cache'
            ? '/session/reports'
            : type === 'key'
              ? guest.value
                ? '/guest/connection'
                : '/account/weread-key'
              : '/account',
          { method: 'DELETE', headers: { 'X-Yuewen-Connection': connection.value ?? 'guest' } },
        )
      if (run !== generation) return
      clear()
      confirmation.value = ''
      if (type === 'account' || type === 'logout') await router.replace('/')
      else {
        if (type === 'key') state.value = { status: 'missing' }
        message.value =
          type === 'cache' ? '临时报告已清除，当前连接保留。' : '已移除 Key 和临时报告。'
      }
    } catch (e) {
      if (run === generation) error.value = e instanceof Error ? e.message : '操作失败，请重试。'
    } finally {
      if (run === generation) busy.value = false
    }
  }
  return { guest, connection, key, show, busy, message, error, state, confirmation, save, action }
}
