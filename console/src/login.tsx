import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { auth, requireOnline } from './session'

const schema = z.object({
  username: z.string().trim().min(3, '请输入管理员账号。').max(30, '账号最长 30 位。'),
  password: z.string().min(1, '请输入密码。').max(128, '密码最长 128 位。'),
})

export default function Login() {
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })
  useEffect(() => () => controller.current?.abort(), [])
  const submit = form.handleSubmit(async (values) => {
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setError('')
    try {
      requireOnline()
      const result = await auth.signIn.username({
        ...values,
        fetchOptions: { signal: request.signal },
      })
      if (request.signal.aborted) return
      if (result.error)
        setError(
          result.error.status === 429
            ? '尝试次数过多，请稍后重试。'
            : result.error.status === 503
              ? '后台暂不可用，请联系维护者。'
              : result.error.status === 401
                ? '账号或密码不正确。'
                : '登录未完成，请稍后重试。',
        )
    } catch {
      if (!request.signal.aborted) setError('登录未完成，请确认网络后主动重试。')
    } finally {
      controller.current = null
      if (!request.signal.aborted) form.resetField('password')
    }
  })
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <a href="/" className="mb-8 flex items-center gap-3">
        <img src="/brand/logo-mark-light.svg" width="36" height="36" alt="" />
        <span>阅纹</span>
      </a>
      <Typography.Title level={1} style={{ fontSize: 28 }}>
        管理后台
      </Typography.Title>
      <Typography.Paragraph type="secondary">使用管理员账号登录。</Typography.Paragraph>
      <form onSubmit={submit} className="mt-6 grid gap-5" aria-label="管理员登录">
        <div>
          <label htmlFor="console-username" className="mb-2 block">
            管理员账号
          </label>
          <Controller
            name="username"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                id="console-username"
                autoComplete="username"
                disabled={form.formState.isSubmitting}
                status={fieldState.error ? 'error' : undefined}
                aria-invalid={!!fieldState.error}
                aria-describedby="username-error"
              />
            )}
          />
          <p id="username-error" role="alert">
            {form.formState.errors.username?.message}
          </p>
        </div>
        <div>
          <label htmlFor="console-password" className="mb-2 block">
            密码
          </label>
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input.Password
                {...field}
                id="console-password"
                autoComplete="current-password"
                disabled={form.formState.isSubmitting}
                status={fieldState.error ? 'error' : undefined}
                aria-invalid={!!fieldState.error}
                aria-describedby="password-error"
              />
            )}
          />
          <p id="password-error" role="alert">
            {form.formState.errors.password?.message}
          </p>
        </div>
        {error && <Alert type="error" title={error} showIcon />}
        <Button
          htmlType="submit"
          type="primary"
          size="large"
          autoInsertSpace={false}
          loading={form.formState.isSubmitting}
        >
          登录
        </Button>
      </form>
    </main>
  )
}
