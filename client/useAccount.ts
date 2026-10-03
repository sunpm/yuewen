import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@client/api'
import { authClient } from '@client/auth'
import { useReport } from '@client/useReport'
export function useAccount() {
  const router = useRouter(),
    { clear } = useReport()
  const key = ref(''),
    show = ref(false),
    busy = ref(false),
    message = ref(''),
    error = ref('')
  const state = ref<{ status: 'missing' | 'valid' | 'invalid'; updatedAt?: string }>()
  const confirmation = ref('')
  onMounted(async () => {
    try {
      state.value = await api('/account/weread-key')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_REQUIRED')
        await router.replace({ path: '/login', query: { next: '/settings' } })
      else error.value = e instanceof Error ? e.message : '设置暂时无法加载。'
    }
  })
  async function save() {
    busy.value = true
    error.value = ''
    message.value = ''
    try {
      state.value = await api('/account/weread-key', {
        method: 'PUT',
        body: JSON.stringify({ apiKey: key.value }),
      })
      key.value = ''
      clear()
      message.value = '微信读书已连接，Key 已加密保存。'
      await router.push('/overview')
    } catch (e) {
      error.value = e instanceof Error ? e.message : '保存失败。'
    } finally {
      key.value = ''
      busy.value = false
    }
  }
  async function action(type: 'cache' | 'key' | 'logout' | 'account') {
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
              ? '/account/weread-key'
              : '/account',
          { method: 'DELETE' },
        )
      clear()
      confirmation.value = ''
      if (type === 'account' || type === 'logout') await router.replace('/')
      else {
        if (type === 'key') state.value = { status: 'missing' }
        message.value =
          type === 'cache' ? '临时报告已清除，登录和 Key 保留。' : '已移除 Key 和临时报告。'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '操作失败，请重试。'
    } finally {
      busy.value = false
    }
  }
  return { key, show, busy, message, error, state, confirmation, save, action }
}
