import { api } from '@client/api'
import { safeReturn } from '@client/returnPath'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Connections } from '@shared/connection'
import { isRangeKey } from '@shared/report'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  auth,
  flow,
  message,
  queries,
  refreshConnections,
  stopPrivate,
  useAction,
  useConnections,
  write,
} from '@/lib/business'

function usePage() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}
const keySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, '请输入完整的 API Key。')
    .max(512, 'API Key 过长。')
    .regex(/^wrk-[A-Za-z0-9_-]+$/, '请输入以 wrk- 开头的 API Key。'),
})

function Settings() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const connections = useConnections()
  const selected =
    params.get('connection') === 'account'
      ? 'account'
      : params.get('connection') === 'guest'
        ? 'guest'
        : connections.data?.guest
          ? 'guest'
          : connections.data?.account
            ? 'account'
            : 'guest'
  const guest = selected === 'guest'
  const state = connections.data?.[selected]
  const action = useAction()
  const alive = usePage()
  const [show, setShow] = useState(false)
  const [notice, setNotice] = useState(
    params.get('expired') === 'GUEST_EXPIRED'
      ? '临时连接已到期或清除，请重新输入 Key。'
      : params.get('expired') === 'AUTH_REQUIRED'
        ? '账号登录已过期，请登录恢复连接，或另用临时连接。'
        : '',
  )
  const form = useForm({ resolver: zodResolver(keySchema), defaultValues: { apiKey: '' } })
  const confirmation = useForm({ defaultValues: { confirmation: '' } })
  const target = new URL(safeReturn(params.get('next') ?? '/overview'), window.location.origin)
  target.searchParams.set('connection', selected)
  target.searchParams.delete('save')
  target.searchParams.delete('saveReport')
  if (!target.searchParams.has('range') && params.get('range'))
    target.searchParams.set('range', params.get('range') as string)
  const next = target.pathname + target.search
  const pending = action.isPending || connections.isFetching
  async function save(data: z.infer<typeof keySchema>) {
    setNotice('')
    try {
      await action.run(async () => {
        stopPrivate(true)
        try {
          await write(() => {
            if (!alive.current) throw new DOMException('页面已离开', 'AbortError')
            return api(guest ? '/guest/connection' : '/account/weread-key', {
              method: 'PUT',
              body: JSON.stringify(data),
            })
          })
        } finally {
          data.apiKey = ''
          form.reset()
        }
        await refreshConnections()
        if (alive.current) {
          const context = queries.getQueryData<Connections>(['connections'])?.[selected]?.context
          const range = target.searchParams.get('range')
          if (context)
            flow.intent = {
              connection: selected,
              range: isRangeKey(range) ? range : 'recent',
              context,
            }
          navigate(next)
        }
      })
    } catch (error) {
      if (alive.current) setNotice(message(error))
    }
  }
  async function remove(kind: 'cache' | 'key' | 'logout' | 'account') {
    if (pending) return
    if (kind === 'key' && confirmation.getValues('confirmation') !== '移除连接') return
    if (kind === 'account' && confirmation.getValues('confirmation') !== '删除账号') return
    setNotice('')
    try {
      await action.run(async () => {
        stopPrivate(true)
        await write(async () => {
          if (!alive.current) throw new DOMException('页面已离开', 'AbortError')
          if (kind === 'logout') {
            const result = await auth.signOut()
            if (result.error) throw new Error('退出失败，请重试。')
          } else
            await api(
              kind === 'cache'
                ? '/session/reports'
                : kind === 'key'
                  ? guest
                    ? '/guest/connection'
                    : '/account/weread-key'
                  : '/account',
              { method: 'DELETE', headers: { 'X-Yuewen-Connection': selected } },
            )
        })
        await refreshConnections()
        if (!alive.current) return
        confirmation.reset()
        if (kind === 'logout' || kind === 'account') navigate('/', { replace: true })
        else
          setNotice(
            kind === 'cache' ? '临时报告已清除，当前连接保留。' : '已移除当前连接和临时报告。',
          )
      })
    } catch (error) {
      if (alive.current) setNotice(message(error))
    }
  }
  return (
    <div className="account-page">
      <p>粘贴 API Key 即可查看和下载。需要下次免填时，再登录保存连接。</p>
      <div className="connection-actions">
        <Link
          className="text-link"
          to={`/settings?connection=${guest ? 'account' : 'guest'}&range=${encodeURIComponent(params.get('range') ?? 'recent')}`}
        >
          {guest ? '使用账号连接' : '另用临时连接'}
        </Link>
        {!guest && (
          <Link
            className="text-link"
            to={`/login?next=${encodeURIComponent(`/settings?connection=account`)}`}
          >
            登录恢复已保存连接
          </Link>
        )}
        {state && state.status !== 'missing' && (
          <Link className="text-link" to={next}>
            继续查看报告
          </Link>
        )}
      </div>
      {connections.isFetching && <p role="status">正在核验连接…</p>}
      {(notice || connections.error) && (
        <p className="notice" role="alert">
          {notice || message(connections.error)}
        </p>
      )}
      {connections.isError && (
        <Button onClick={() => void connections.refetch()}>重试核验连接</Button>
      )}
      <section className="data-panel">
        <h2>{guest ? '临时连接' : '账号连接'}</h2>
        <p>
          {state?.status === 'valid'
            ? '已连接'
            : state?.status === 'invalid'
              ? 'Key 已失效，请重新配置。已有结果在原期限内仍可查看。'
              : '尚未连接'}
        </p>
        <p>
          {guest
            ? 'Key 在服务端加密暂存；闲置 30 分钟、最长 2 小时后清理。'
            : 'Key 加密保存到账号，临时报告仍会到期。'}
        </p>
        <a
          className="text-link"
          href="https://weread.qq.com/r/weread-skills"
          target="_blank"
          rel="noopener noreferrer"
        >
          前往微信读书获取 API Key ↗
        </a>
        <form onSubmit={form.handleSubmit(save)} className="account-form">
          <label htmlFor="api-key">{state?.status === 'valid' ? '更换 API Key' : 'API Key'}</label>
          <div className="key-field">
            <input
              id="api-key"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              {...form.register('apiKey')}
            />
            <Button
              type="button"
              variant="ghost"
              aria-pressed={show}
              onClick={() => setShow(!show)}
            >
              {show ? '隐藏' : '显示'}
            </Button>
          </div>
          {form.formState.errors.apiKey && (
            <p role="alert">{form.formState.errors.apiKey.message}</p>
          )}
          <Button type="submit" disabled={pending || (!guest && !state)}>
            {action.isPending ? '正在验证…' : '验证并生成'}
          </Button>
          <p className="muted-copy">验证成功后才替换现有连接，并生成所选范围的报告。</p>
        </form>
      </section>
      {!guest && (
        <section className="data-panel">
          <h2>密码与登录</h2>
          <p>默认使用邮箱验证码；也可以设置或重置密码。</p>
          <Link className="text-link" to="/login?mode=reset">
            设置或重置密码
          </Link>
        </section>
      )}
      <section className="data-panel">
        <h2>连接与数据</h2>
        <p>
          清除报告会停止当前连接的采集，并保留 Key。退出账号会清除账号会话与临时报告，并保留账号
          Key。
        </p>
        <div className="connection-actions">
          <Button
            variant="outline"
            disabled={pending || !state}
            onClick={() => void remove('cache')}
          >
            清除报告
          </Button>
          {!guest && (
            <Button
              variant="outline"
              disabled={pending || !state}
              onClick={() => void remove('logout')}
            >
              退出登录
            </Button>
          )}
        </div>
        <details className="method-details">
          <summary>{guest ? '移除临时连接' : '移除连接或删除账号'}</summary>
          <p>
            {guest
              ? '移除游客 Key 和临时报告，不影响账号连接。'
              : '移除连接会删除账号 Key 和临时报告，保留历史报告。删除账号还会删除全部存档及账号数据，需在 10 分钟内重新登录。'}
          </p>
          <label htmlFor="confirmation">输入「移除连接」{!guest && '或「删除账号」'}确认</label>
          <input id="confirmation" autoComplete="off" {...confirmation.register('confirmation')} />
          <div className="connection-actions">
            <Button
              variant="outline"
              disabled={pending || confirmation.watch('confirmation') !== '移除连接'}
              onClick={() => void remove('key')}
            >
              移除连接
            </Button>
            {!guest && (
              <Button
                variant="outline"
                disabled={pending || confirmation.watch('confirmation') !== '删除账号'}
                onClick={() => void remove('account')}
              >
                删除账号
              </Button>
            )}
          </div>
        </details>
      </section>
    </div>
  )
}

function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const alive = usePage()
  const action = useAction()
  const [mode, setMode] = useState<'otp' | 'password' | 'reset'>(
    params.get('mode') === 'reset' ? 'reset' : 'otp',
  )
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState('')
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api<{ auth: boolean }>('/health', { signal }),
  })
  const schema = z.object({
    email: z.email('请输入有效邮箱。'),
    otp:
      mode !== 'password' && sent ? z.string().regex(/^\d{6}$/, '请输入 6 位验证码。') : z.string(),
    password:
      mode === 'password' || (mode === 'reset' && sent)
        ? z.string().min(8, '密码至少 8 位。').max(128, '密码不能超过 128 位。')
        : z.string(),
  })
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', otp: '', password: '' },
  })
  const next = safeReturn(params.get('next'))
  const cancel = new URL(next, window.location.origin)
  cancel.searchParams.delete('save')
  cancel.searchParams.delete('saveReport')
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])
  async function send() {
    if (action.isPending || cooldown || !(await form.trigger('email'))) return
    setNotice('')
    try {
      await action.run(async () => {
        const result = await auth.emailOtp.sendVerificationOtp({
          email: form.getValues('email'),
          type: mode === 'reset' ? 'forget-password' : 'sign-in',
        })
        if (!alive.current) return
        if (result.error) throw new Error('验证码暂未发送，请检查邮箱或稍后重试。')
        setSent(true)
        setCooldown(60)
      })
    } catch (error) {
      if (alive.current) setNotice(message(error))
    }
  }
  async function submit(data: z.infer<typeof schema>) {
    if (mode !== 'password' && !sent) return send()
    setNotice('')
    try {
      await action.run(async () => {
        stopPrivate(true)
        try {
          const result =
            mode === 'password'
              ? await auth.signIn.email({ email: data.email, password: data.password })
              : mode === 'reset'
                ? await auth.emailOtp.resetPassword({
                    email: data.email,
                    otp: data.otp,
                    password: data.password,
                  })
                : await auth.signIn.emailOtp({ email: data.email, otp: data.otp })
          if (!alive.current) return
          if (result.error)
            throw new Error(
              mode === 'password'
                ? '邮箱或密码不正确，请重试或使用验证码。'
                : '验证码无效或已过期，请重试。',
            )
          if (mode === 'reset') {
            setMode('password')
            setSent(false)
            setNotice('密码已更新，请重新登录。')
            return
          }
          await refreshConnections()
          if (alive.current) navigate(next, { replace: true })
        } finally {
          data.password = ''
          data.otp = ''
          form.setValue('password', '')
          form.setValue('otp', '')
        }
      })
    } catch (error) {
      if (alive.current) setNotice(message(error))
    }
  }
  function switchMode(value: typeof mode) {
    setMode(value)
    setSent(false)
    setNotice('')
    form.reset({ email: form.getValues('email'), otp: '', password: '' })
  }
  return (
    <section className="data-panel login-panel">
      <h2>{mode === 'reset' ? '设置或重置密码' : '登录'}</h2>
      <p>无需登录也能查看和下载临时报告；登录本身不会替换账号连接。</p>
      <div className="connection-actions">
        {(['otp', 'password', 'reset'] as const).map((value) => (
          <Button
            key={value}
            variant={mode === value ? 'default' : 'ghost'}
            disabled={action.isPending}
            onClick={() => switchMode(value)}
          >
            {value === 'otp' ? '邮箱验证码' : value === 'password' ? '密码登录' : '设置或重置'}
          </Button>
        ))}
      </div>
      {health.data?.auth === false && (
        <p className="notice">邮箱登录暂不可用，你仍可返回临时报告查看和下载。</p>
      )}
      {(notice || health.error) && (
        <p role="alert" className="notice">
          {notice || message(health.error)}
        </p>
      )}
      <form onSubmit={form.handleSubmit(submit)} className="account-form">
        <label htmlFor="email">邮箱</label>
        <input id="email" type="email" autoComplete="email" {...form.register('email')} />
        {form.formState.errors.email && <p role="alert">{form.formState.errors.email.message}</p>}
        {mode !== 'password' && sent && (
          <>
            <label htmlFor="otp">6 位验证码</label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              {...form.register('otp')}
            />
            {form.formState.errors.otp && <p role="alert">{form.formState.errors.otp.message}</p>}
            <Button
              type="button"
              variant="ghost"
              disabled={action.isPending || cooldown > 0}
              onClick={() => void send()}
            >
              {cooldown ? `${cooldown} 秒后重发` : '重新发送'}
            </Button>
          </>
        )}
        {(mode === 'password' || (mode === 'reset' && sent)) && (
          <>
            <label htmlFor="password">{mode === 'reset' ? '新密码' : '密码'}</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
              {...form.register('password')}
            />
            {form.formState.errors.password && (
              <p role="alert">{form.formState.errors.password.message}</p>
            )}
          </>
        )}
        <Button
          type="submit"
          disabled={
            action.isPending ||
            health.data?.auth === false ||
            (mode !== 'password' && !sent && cooldown > 0)
          }
        >
          {action.isPending
            ? '正在处理…'
            : mode !== 'password' && !sent
              ? '发送验证码'
              : mode === 'reset'
                ? '更新密码'
                : '登录'}
        </Button>
      </form>
      <Link className="text-link" to={cancel.pathname + cancel.search}>
        取消，返回继续查看
      </Link>
    </section>
  )
}
export default function Account() {
  const location = useLocation()
  return location.pathname.replace(/\/+$/, '') === '/login' ? (
    <Login key={location.key} />
  ) : (
    <Settings key={location.key} />
  )
}
