import { ApiError, api } from '@client/api'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { consoleRequest, queries, requireOnline } from './session'

const statuses = { pending: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }
const categories = { uncategorized: '未分类', bug: '问题', suggestion: '建议', other: '其他' }
const sources = { mock: '示例', guest: '游客连接', account: '账号连接', none: '未连接' }
const owners = { account: '账号', guest: '游客', visitor: '未验证访客' }
const options = (values: Record<string, string>) =>
  Object.entries(values).map(([value, label]) => ({ value, label }))
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
const message = (error: unknown) =>
  error instanceof Error ? error.message : '请求未完成，请主动重试。'
type Row = {
  id: string
  ownerType: keyof typeof owners
  source: keyof typeof sources
  email: string | null
  status: keyof typeof statuses
  category: keyof typeof categories
  version: number
  createdAt: string
}
type Detail = Row & {
  description: string
  steps: string
  contact: string
  internalNote: string
  expiresAt: string
  owner: { name: string; email: string } | null
  environment: Record<string, unknown>
  serverEnvironment: Record<string, unknown>
  screenshot: {
    mime: string
    bytes: number
    width: number
    height: number
    expiresAt: string
  } | null
}
const filterSchema = z
  .object({ status: z.string(), source: z.string(), from: z.string(), to: z.string() })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '开始日期不能晚于结束日期。',
    path: ['to'],
  })
const editSchema = z.object({
  status: z.enum(['pending', 'processing', 'resolved', 'closed']),
  category: z.enum(['uncategorized', 'bug', 'suggestion', 'other']),
  internalNote: z.string().trim().max(4000, '备注最多 4,000 字。'),
})

export default function Feedback({ sessionId }: { sessionId: string }) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(filterSchema),
    defaultValues: { status: '', source: '', from: '', to: '' },
  })
  const list = useQuery({
    queryKey: ['console', sessionId, 'feedback', 'list', page, filter],
    queryFn: ({ signal }) =>
      consoleRequest<{ items: Row[]; total: number }>(
        `/feedback?page=${page}&pageSize=20${filter}`,
        signal,
      ),
  })
  return (
    <section>
      <Typography.Title level={1} style={{ fontSize: 28 }}>
        意见反馈
      </Typography.Title>
      <form
        className="mb-6 flex flex-wrap items-end gap-4"
        onSubmit={form.handleSubmit((values) => {
          const params = new URLSearchParams()
          if (values.status) params.set('status', values.status)
          if (values.source) params.set('source', values.source)
          if (values.from) params.set('from', new Date(`${values.from}T00:00:00`).toISOString())
          if (values.to) params.set('to', new Date(`${values.to}T23:59:59.999`).toISOString())
          setPage(1)
          setFilter(`&${params}`)
        })}
      >
        <div>
          <label htmlFor="filter-status" className="mb-2 block">
            状态
          </label>
          <Controller
            name="status"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                id="filter-status"
                style={{ width: 140 }}
                options={[{ value: '', label: '全部状态' }, ...options(statuses)]}
              />
            )}
          />
        </div>
        <div>
          <label htmlFor="filter-source" className="mb-2 block">
            页面来源
          </label>
          <Controller
            name="source"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                id="filter-source"
                style={{ width: 140 }}
                options={[{ value: '', label: '全部来源' }, ...options(sources)]}
              />
            )}
          />
        </div>
        <div>
          <label htmlFor="filter-from" className="mb-2 block">
            开始日期
          </label>
          <input id="filter-from" type="date" {...form.register('from')} />
        </div>
        <div>
          <label htmlFor="filter-to" className="mb-2 block">
            结束日期
          </label>
          <input id="filter-to" type="date" {...form.register('to')} />
        </div>
        <Button htmlType="submit" type="primary">
          筛选
        </Button>
        <Button disabled={list.isFetching} onClick={() => void list.refetch()}>
          刷新
        </Button>
        {form.formState.errors.to && <p role="alert">{form.formState.errors.to.message}</p>}
      </form>
      {list.error ? (
        <Alert type="error" title={message(list.error)} />
      ) : (
        <Table<Row>
          rowKey="id"
          loading={list.isFetching}
          dataSource={list.data?.items ?? []}
          scroll={{ x: 800 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: list.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            { title: '提交时间', dataIndex: 'createdAt', render: time },
            { title: '反馈者', render: (_, row) => row.email || owners[row.ownerType] },
            {
              title: '页面来源',
              dataIndex: 'source',
              render: (value: Row['source']) => sources[value],
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value: Row['status']) => statuses[value],
            },
            {
              title: '分类',
              dataIndex: 'category',
              render: (value: Row['category']) => categories[value],
            },
            {
              title: '操作',
              render: (_, row) => <Button onClick={() => setSelected(row.id)}>查看与处理</Button>,
            },
          ]}
        />
      )}
      <Modal
        title="反馈详情"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={880}
        destroyOnHidden
      >
        {selected && (
          <FeedbackDetail
            key={selected}
            sessionId={sessionId}
            id={selected}
            close={() => setSelected(null)}
          />
        )}
      </Modal>
    </section>
  )
}

function FeedbackDetail({
  sessionId,
  id,
  close,
}: {
  sessionId: string
  id: string
  close: () => void
}) {
  const [notice, setNotice] = useState('')
  const detail = useQuery({
    queryKey: ['console', sessionId, 'feedback', 'detail', id],
    queryFn: ({ signal }) => consoleRequest<Detail>(`/feedback/${id}`, signal),
    gcTime: 0,
  })
  if (detail.error)
    return (
      <Alert
        type="error"
        title={message(detail.error)}
        action={<Button onClick={() => void detail.refetch()}>重试</Button>}
      />
    )
  if (!detail.data) return <Card loading />
  return (
    <>
      <Descriptions
        column={1}
        items={[
          { key: 'id', label: '编号', children: detail.data.id },
          {
            key: 'owner',
            label: '核验属主',
            children: detail.data.owner
              ? `${detail.data.owner.name} · ${detail.data.owner.email}`
              : owners[detail.data.ownerType],
          },
          { key: 'source', label: '页面来源', children: sources[detail.data.source] },
          { key: 'created', label: '提交时间', children: time(detail.data.createdAt) },
          { key: 'contact', label: '联系方式', children: detail.data.contact || '未填写' },
          {
            key: 'description',
            label: '问题描述',
            children: (
              <div className="whitespace-pre-wrap break-words">{detail.data.description}</div>
            ),
          },
          {
            key: 'steps',
            label: '复现步骤',
            children: (
              <div className="whitespace-pre-wrap break-words">{detail.data.steps || '未填写'}</div>
            ),
          },
        ]}
      />
      {detail.data.screenshot ? (
        <Screenshot sessionId={sessionId} id={id} screenshot={detail.data.screenshot} />
      ) : (
        <p>没有可用截图。</p>
      )}
      <details className="my-4">
        <summary>用户页面环境与服务端环境</summary>
        <p>页面信息由客户端提供，仅用于诊断。</p>
        <pre className="overflow-auto whitespace-pre-wrap break-all">
          {JSON.stringify(
            { client: detail.data.environment, server: detail.data.serverEnvironment },
            null,
            2,
          )}
        </pre>
      </details>
      {notice && <p role="status">{notice}</p>}
      <FeedbackEditor
        key={detail.data.version}
        sessionId={sessionId}
        detail={detail.data}
        refresh={() => void detail.refetch()}
        close={close}
        notify={setNotice}
      />
    </>
  )
}

function Screenshot({
  sessionId,
  id,
  screenshot,
}: {
  sessionId: string
  id: string
  screenshot: NonNullable<Detail['screenshot']>
}) {
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const image = useQuery({
    queryKey: ['console', sessionId, 'feedback', 'screenshot', id],
    enabled,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      requireOnline()
      const response = await fetch(`/api/console/feedback/${id}/screenshot`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new ApiError(error.code ?? 'SERVICE_ERROR', error.message ?? '截图加载失败，请重试。')
      }
      return response.blob()
    },
  })
  useEffect(() => {
    if (!image.data || image.error) {
      setUrl('')
      return
    }
    const objectUrl = URL.createObjectURL(image.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image.data, image.error])
  return (
    <div className="my-4">
      <p>
        截图 {screenshot.width} × {screenshot.height} · {Math.ceil(screenshot.bytes / 1024)} KiB ·
        有效期至 {time(screenshot.expiresAt)}
      </p>
      {!enabled && <Button onClick={() => setEnabled(true)}>加载私有截图</Button>}
      {image.isFetching && <p role="status">正在读取截图…</p>}
      {image.error && (
        <Alert
          type="warning"
          title={message(image.error)}
          action={<Button onClick={() => void image.refetch()}>重试</Button>}
        />
      )}
      {url && (
        <img
          src={url}
          alt="用户提交的反馈截图"
          className="max-h-[600px] max-w-full object-contain"
        />
      )}
    </div>
  )
}

function FeedbackEditor({
  sessionId,
  detail,
  refresh,
  close,
  notify,
}: {
  sessionId: string
  detail: Detail
  refresh: () => void
  close: () => void
  notify: (value: string) => void
}) {
  const controller = useRef<AbortController | null>(null)
  const form = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      status: detail.status,
      category: detail.category,
      internalNote: detail.internalNote,
    },
  })
  const action = useMutation({
    mutationFn: async (operation: 'save' | 'delete') => {
      requireOnline()
      const run = new AbortController()
      controller.current = run
      try {
        await api(
          `/console/feedback/${detail.id}${operation === 'delete' ? `?version=${detail.version}` : ''}`,
          {
            method: operation === 'delete' ? 'DELETE' : 'PATCH',
            signal: run.signal,
            ...(operation === 'save'
              ? {
                  body: JSON.stringify({
                    ...editSchema.parse(form.getValues()),
                    version: detail.version,
                  }),
                }
              : {}),
          },
        )
        if (run.signal.aborted) return
        if (operation === 'delete') {
          queries.removeQueries({
            queryKey: ['console', sessionId, 'feedback', 'screenshot', detail.id],
          })
          close()
        } else notify('处理结果已保存。')
        await queries.invalidateQueries({ queryKey: ['console', sessionId, 'feedback'] })
      } finally {
        if (controller.current === run) controller.current = null
      }
    },
  })
  const reset = action.reset
  useEffect(
    () => () => {
      controller.current?.abort()
      reset()
    },
    [reset],
  )
  const run = (operation: 'save' | 'delete') => {
    if (!controller.current && !action.isPending) {
      notify('')
      action.mutate(operation)
    }
  }
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(() => run('save'))}>
      <div>
        <label htmlFor="feedback-status" className="mb-2 block">
          处理状态
        </label>
        <Controller
          name="status"
          control={form.control}
          render={({ field }) => (
            <Select
              {...field}
              id="feedback-status"
              disabled={action.isPending}
              options={options(statuses)}
              style={{ width: '100%' }}
            />
          )}
        />
      </div>
      <div>
        <label htmlFor="feedback-category" className="mb-2 block">
          分类
        </label>
        <Controller
          name="category"
          control={form.control}
          render={({ field }) => (
            <Select
              {...field}
              id="feedback-category"
              disabled={action.isPending}
              options={options(categories)}
              style={{ width: '100%' }}
            />
          )}
        />
      </div>
      <div>
        <label htmlFor="feedback-internal-note" className="mb-2 block">
          内部备注
        </label>
        <Controller
          name="internalNote"
          control={form.control}
          render={({ field }) => (
            <Input.TextArea
              {...field}
              id="feedback-internal-note"
              rows={4}
              maxLength={4000}
              disabled={action.isPending}
            />
          )}
        />
        {form.formState.errors.internalNote && (
          <p role="alert">{form.formState.errors.internalNote.message}</p>
        )}
      </div>
      {action.error && (
        <Alert
          type="error"
          title={message(action.error)}
          description="草稿保留；刷新会载入最新版本并替换草稿。"
          action={
            <Button disabled={action.isPending} onClick={refresh}>
              刷新详情
            </Button>
          }
        />
      )}
      <Space>
        <Button htmlType="submit" type="primary" loading={action.isPending}>
          保存处理结果
        </Button>
        <Popconfirm
          title="删除这条反馈？"
          description="原文和附件将不可访问，无法撤销。"
          onConfirm={() => run('delete')}
          okText="删除"
          cancelText="取消"
          disabled={action.isPending}
        >
          <Button danger disabled={action.isPending}>
            删除反馈
          </Button>
        </Popconfirm>
      </Space>
    </form>
  )
}
