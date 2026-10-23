import { api } from '@client/api'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Input, Modal, Select, Space, Typography } from 'antd'
import { useEffect, useRef } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { managementConfirmation, managementReasons, renameUserInput } from '../../shared/console'
import { queries, requireOnline } from './session'

const actions = {
  'user.rename': {
    title: '编辑昵称',
    path: '/users',
    suffix: '',
    impact: '仅修改昵称，不改变邮箱和验证状态。',
  },
  'user.delete': {
    title: '删除账号',
    path: '/users',
    suffix: '/delete',
    impact:
      '删除账号、登录会话、连接、临时报告、全部存档及自有反馈。附件将排入清理任务；作为辅助登录账号关联的游客反馈会保留。删除后无法恢复。',
  },
  'credential.revoke': {
    title: '撤销账号连接',
    path: '/data/credentials',
    suffix: '/revoke',
    impact:
      '移除保存的连接，并停止、清除该账号的全部报告。账号仍可登录，重新配置连接后可再次采集。',
  },
  'guest.revoke': {
    title: '撤销游客连接',
    path: '/data/guests',
    suffix: '/revoke',
    impact: '立即使游客连接失效并清除其报告，正在读取的旧结果无法写回。已提交反馈保留为游客反馈。',
  },
  'session.revoke': {
    title: '撤销用户会话',
    path: '/data/sessions',
    suffix: '/revoke',
    impact: '使这个登录会话失效，并清除该会话的报告与回执。其他会话和账号保存的连接保留。',
  },
  'report.stop': {
    title: '停止报告采集',
    path: '/data/reports',
    suffix: '/stop',
    impact: '停止后续采集并废弃当前批次，保留已有结果、请求预算和到期时间。用户之后可以主动继续。',
  },
  'report.clear': {
    title: '清除报告',
    path: '/data/reports',
    suffix: '/clear',
    impact:
      '停止采集并删除这份报告，旧批次和原生成请求不能恢复它。连接保留，用户可以主动生成新报告。',
  },
} as const
export type ActionTarget = {
  action: keyof typeof actions
  id: string
  updatedAt: string
  version?: number
  name?: string
}
const formSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rename'), name: renameUserInput.shape.name }),
  managementConfirmation.extend({
    kind: z.literal('danger'),
    confirmed: z.boolean().refine(Boolean, '请确认已了解操作影响。'),
  }),
])

export function ManagementAction({
  target,
  sessionId,
  close,
  done,
}: {
  target: ActionTarget
  sessionId: string
  close: () => void
  done: (message: string) => void
}) {
  const action = actions[target.action]
  const rename = target.action === 'user.rename'
  const controller = useRef<AbortController | null>(null)
  const pending = useRef(false)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: rename
      ? { kind: 'rename', name: target.name ?? '' }
      : { kind: 'danger', password: '', confirmed: false },
  })
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )
  const mutation = useMutation({
    // Read/clear the password inside the call; Query mutation variables never contain it.
    mutationFn: async () => {
      const values = formSchema.parse(form.getValues())
      const body = JSON.stringify({
        updatedAt: target.updatedAt,
        ...(values.kind === 'rename'
          ? { name: values.name }
          : {
              password: values.password,
              reason: values.reason,
              ...(target.version === undefined ? {} : { version: target.version }),
            }),
      })
      if (values.kind === 'danger') form.setValue('password', '')
      requireOnline()
      controller.current = new AbortController()
      await api(`/console${action.path}/${encodeURIComponent(target.id)}${action.suffix}`, {
        method: rename ? 'PATCH' : 'POST',
        body,
        signal: controller.current.signal,
      })
    },
  })
  const refresh = () => queries.invalidateQueries({ queryKey: ['console', sessionId] })
  async function submit() {
    if (pending.current) return
    pending.current = true
    try {
      await mutation.mutateAsync()
      if (controller.current?.signal.aborted) return
      done(`${action.title}已完成。`)
      close()
      await refresh()
    } catch {
      // The request may already have committed; keep the version and require an explicit retry.
    } finally {
      pending.current = false
    }
  }
  return (
    <Modal open title={action.title} footer={null} onCancel={close} destroyOnHidden>
      <Typography.Paragraph>{action.impact}</Typography.Paragraph>
      <Typography.Paragraph className="break-all">目标 ID：{target.id}</Typography.Paragraph>
      <form aria-label={action.title} className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
        {rename ? (
          <div>
            <label htmlFor="management-name" className="mb-2 block">
              昵称
            </label>
            <Controller
              name="name"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="management-name"
                  maxLength={100}
                  disabled={mutation.isPending}
                />
              )}
            />
            {form.getFieldState('name').error && (
              <p role="alert">{form.getFieldState('name').error?.message}</p>
            )}
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="management-reason" className="mb-2 block">
                操作原因
              </label>
              <Controller
                name="reason"
                control={form.control}
                render={({ field }) => (
                  <Select
                    {...field}
                    id="management-reason"
                    placeholder="请选择原因"
                    style={{ width: '100%' }}
                    disabled={mutation.isPending}
                    options={Object.entries(managementReasons).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />
                )}
              />
              {form.getFieldState('reason').error && <p role="alert">请选择操作原因。</p>}
            </div>
            <div>
              <label htmlFor="management-password" className="mb-2 block">
                管理员当前密码
              </label>
              <Controller
                name="password"
                control={form.control}
                render={({ field }) => (
                  <Input.Password
                    {...field}
                    id="management-password"
                    autoComplete="current-password"
                    maxLength={128}
                    disabled={mutation.isPending}
                  />
                )}
              />
              {form.getFieldState('password').error && (
                <p role="alert">{form.getFieldState('password').error?.message}</p>
              )}
            </div>
            <div>
              <Controller
                name="confirmed"
                control={form.control}
                render={({ field: { value, onChange, ...field } }) => (
                  <Checkbox
                    {...field}
                    checked={value}
                    onChange={(event) => onChange(event.target.checked)}
                    disabled={mutation.isPending}
                  >
                    我已核对目标并了解操作影响
                  </Checkbox>
                )}
              />
              {form.getFieldState('confirmed').error && (
                <p role="alert">{form.getFieldState('confirmed').error?.message}</p>
              )}
            </div>
          </>
        )}
        {mutation.error && (
          <Alert
            type="error"
            title={mutation.error.message}
            description="若结果未确认，请先刷新检查，操作不会自动重试。"
            action={
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  close()
                  void refresh()
                }}
              >
                刷新并关闭
              </Button>
            }
          />
        )}
        <Space>
          <Button htmlType="submit" type="primary" danger={!rename} loading={mutation.isPending}>
            确认{action.title}
          </Button>
          <Button onClick={close}>取消</Button>
        </Space>
      </form>
    </Modal>
  )
}
