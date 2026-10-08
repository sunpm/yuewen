import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authClient } from '@client/auth'
import { api } from '@client/api'
import { useReport } from '@client/useReport'
import { safeReturn } from './useConnection'
export function useLogin() {
  const email = ref(''),
    otp = ref(''),
    password = ref(''),
    mode = ref<'otp' | 'password' | 'reset'>('otp')
  const sent = ref(false),
    busy = ref(false),
    error = ref(''),
    cooldown = ref(0),
    configured = ref(true)
  const route = useRoute(),
    router = useRouter()
  if (route.query.mode === 'reset') mode.value = 'reset'
  const { clear } = useReport()
  let timer: ReturnType<typeof setInterval> | undefined
  let generation = 0
  watch(
    () => route.fullPath,
    () => {
      generation++
      busy.value = false
      password.value = ''
      otp.value = ''
    },
    { flush: 'sync' },
  )
  onMounted(async () => {
    try {
      configured.value = (await api<{ auth: boolean }>('/health')).auth
    } catch {
      configured.value = false
    }
  })
  onUnmounted(() => {
    generation++
    clearInterval(timer)
    password.value = ''
    otp.value = ''
  })
  function startCooldown() {
    cooldown.value = 60
    clearInterval(timer)
    timer = setInterval(() => {
      cooldown.value--
      if (!cooldown.value) clearInterval(timer)
    }, 1000)
  }
  async function send() {
    if (busy.value) return
    const run = generation
    busy.value = true
    error.value = ''
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.value,
        type: mode.value === 'reset' ? 'forget-password' : 'sign-in',
      })
      if (run !== generation) return
      if (result.error) {
        error.value = '验证码暂未发送，请检查邮箱地址或稍后重试。'
        return
      }
      sent.value = true
      startCooldown()
    } catch {
      if (run === generation) error.value = '服务暂时无法连接，请稍后重试。'
    } finally {
      if (run === generation) busy.value = false
    }
  }
  async function submit() {
    if (busy.value) return
    if (mode.value !== 'password' && !sent.value) return send()
    const run = generation
    busy.value = true
    error.value = ''
    try {
      const result =
        mode.value === 'password'
          ? await authClient.signIn.email({ email: email.value, password: password.value })
          : mode.value === 'reset'
            ? await authClient.emailOtp.resetPassword({
                email: email.value,
                otp: otp.value,
                password: password.value,
              })
            : await authClient.signIn.emailOtp({ email: email.value, otp: otp.value })
      if (run !== generation) return
      if (result.error) {
        error.value =
          mode.value === 'password'
            ? '邮箱或密码不正确，请重试或使用验证码。'
            : '验证码无效或已过期，请重试。'
        return
      }
      password.value = ''
      otp.value = ''
      if (!safeReturn(route.query.next).includes('save=')) clear()
      if (mode.value === 'reset') {
        mode.value = 'password'
        sent.value = false
        error.value = '密码已更新，请重新登录。'
        return
      }
      await router.replace(safeReturn(route.query.next))
    } catch {
      if (run === generation) error.value = '服务暂时无法连接，请稍后重试。'
    } finally {
      if (run === generation) busy.value = false
    }
  }
  function changeMode(value: 'otp' | 'password' | 'reset') {
    generation++
    busy.value = false
    mode.value = value
    sent.value = false
    error.value = ''
    password.value = ''
    otp.value = ''
  }
  return {
    returnTo: safeReturn(route.query.next)
      .replace(/([?&])save=[^&]*&?/, '$1')
      .replace(/([?&])saveReport=[^&]*&?/, '$1')
      .replace(/[?&]$/, ''),
    email,
    otp,
    password,
    mode,
    sent,
    busy,
    error,
    cooldown,
    configured,
    send,
    submit,
    changeMode,
  }
}
