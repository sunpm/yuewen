import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Descriptions, Input, Modal, Select, Table, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { ResourceTable } from './data'
import { connectionLabels, type PageResult, ReadError, status, time } from './data-display'
import { consoleRequest } from './session'

type UserRow = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  createdAt: string
  updatedAt: string
  connectionStatus: keyof typeof connectionLabels
  latestSessionCreatedAt: string | null
  feedbackCount: number
}
const filterSchema = z
  .object({
    search: z.string().trim().max(254, '搜索内容最多 254 字。'),
    verified: z.enum(['', 'true', 'false']),
    connection: z.enum(['', 'unconfigured', 'valid', 'invalid']),
    from: z.union([z.literal(''), z.iso.date()]),
    to: z.union([z.literal(''), z.iso.date()]),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '开始日期不能晚于结束日期。',
    path: ['to'],
  })

export default function Users({ sessionId }: { sessionId: string }) {
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 })
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(filterSchema),
    defaultValues: { search: '', verified: '' as const, connection: '' as const, from: '', to: '' },
  })
  const list = useQuery({
    queryKey: ['console', sessionId, 'users', 'list', pagination, filter],
    queryFn: ({ signal }) =>
      consoleRequest<PageResult<UserRow>>(
        `/users?page=${pagination.page}&pageSize=${pagination.pageSize}${filter}`,
        signal,
      ),
    gcTime: 0,
  })
  return (
    <section>
      <Typography.Title level={1} style={{ fontSize: 28 }}>
        用户管理
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        列表邮箱已脱敏，详情可查看完整邮箱。最近会话创建时间仅取当前有效会话；反馈数仅计用户自有、有效且已提交的反馈。
      </Typography.Paragraph>
      <form
        aria-label="用户筛选"
        className="mb-6 flex flex-wrap items-end gap-4"
        onSubmit={form.handleSubmit((values) => {
          const params = new URLSearchParams()
          if (values.search) params.set('search', values.search)
          if (values.verified) params.set('verified', values.verified)
          if (values.connection) params.set('connection', values.connection)
          if (values.from) params.set('from', new Date(`${values.from}T00:00:00`).toISOString())
          if (values.to) params.set('to', new Date(`${values.to}T23:59:59.999`).toISOString())
          setPagination((current) => ({ ...current, page: 1 }))
          setFilter(`&${params}`)
        })}
      >
        <div>
          <label htmlFor="user-search" className="mb-2 block">
            用户 ID / 邮箱
          </label>
          <Controller
            name="search"
            control={form.control}
            render={({ field }) => (
              <Input {...field} id="user-search" type="search" autoComplete="off" maxLength={254} />
            )}
          />
          {form.formState.errors.search && (
            <p role="alert">{form.formState.errors.search.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="user-verified" className="mb-2 block">
            邮箱验证
          </label>
          <Controller
            name="verified"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                id="user-verified"
                style={{ width: 140 }}
                options={[
                  { value: '', label: '全部' },
                  { value: 'true', label: '已验证' },
                  { value: 'false', label: '未验证' },
                ]}
              />
            )}
          />
        </div>
        <div>
          <label htmlFor="user-connection" className="mb-2 block">
            连接状态
          </label>
          <Controller
            name="connection"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                id="user-connection"
                style={{ width: 140 }}
                options={[
                  { value: '', label: '全部' },
                  ...Object.entries(connectionLabels).map(([value, label]) => ({ value, label })),
                ]}
              />
            )}
          />
        </div>
        <div>
          <label htmlFor="user-from" className="mb-2 block">
            注册开始日期
          </label>
          <Controller
            name="from"
            control={form.control}
            render={({ field }) => <Input {...field} id="user-from" type="date" />}
          />
          {form.formState.errors.from && <p role="alert">{form.formState.errors.from.message}</p>}
        </div>
        <div>
          <label htmlFor="user-to" className="mb-2 block">
            注册结束日期
          </label>
          <Controller
            name="to"
            control={form.control}
            render={({ field }) => <Input {...field} id="user-to" type="date" />}
          />
          {form.formState.errors.to && <p role="alert">{form.formState.errors.to.message}</p>}
        </div>
        <Button htmlType="submit" type="primary">
          筛选
        </Button>
        <Button
          onClick={() => {
            form.reset()
            setFilter('')
            setPagination((current) => ({ ...current, page: 1 }))
          }}
        >
          重置
        </Button>
        <Button disabled={list.isFetching} onClick={() => void list.refetch()}>
          刷新
        </Button>
      </form>
      {list.error ? (
        <ReadError error={list.error} loading={list.isFetching} retry={() => void list.refetch()} />
      ) : (
        <Table<UserRow>
          rowKey="id"
          loading={list.isFetching}
          dataSource={list.data?.items ?? []}
          scroll={{ x: 1400 }}
          locale={{ emptyText: '没有符合条件的用户' }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: list.data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `共 ${total} 位用户`,
            onChange: (page, pageSize) =>
              setPagination({ page: pageSize === pagination.pageSize ? page : 1, pageSize }),
          }}
          columns={[
            {
              title: '用户 ID',
              dataIndex: 'id',
              render: (value: string) => <span className="break-all">{value}</span>,
            },
            { title: '昵称', dataIndex: 'name' },
            { title: '邮箱（脱敏）', dataIndex: 'email' },
            {
              title: '邮箱验证',
              dataIndex: 'emailVerified',
              render: (value: boolean) => (value ? '已验证' : '未验证'),
            },
            { title: '连接状态', dataIndex: 'connectionStatus', render: status },
            { title: '注册时间', dataIndex: 'createdAt', render: time },
            { title: '最近会话创建时间', dataIndex: 'latestSessionCreatedAt', render: time },
            { title: '有效反馈数', dataIndex: 'feedbackCount' },
            {
              title: '操作',
              render: (_, row) => <Button onClick={() => setSelected(row.id)}>查看详情</Button>,
            },
          ]}
        />
      )}
      <Modal
        title="用户详情"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={1100}
        destroyOnHidden
      >
        {selected && <UserDetail key={selected} sessionId={sessionId} id={selected} />}
      </Modal>
    </section>
  )
}

function UserDetail({ sessionId, id }: { sessionId: string; id: string }) {
  const [tab, setTab] = useState('profile')
  const detail = useQuery({
    queryKey: ['console', sessionId, 'users', 'detail', id],
    queryFn: ({ signal }) => consoleRequest<UserRow>(`/users/${encodeURIComponent(id)}`, signal),
    gcTime: 0,
  })
  if (detail.error)
    return (
      <ReadError
        error={detail.error}
        loading={detail.isFetching}
        retry={() => void detail.refetch()}
      />
    )
  if (!detail.data) return <Card loading />
  const row = detail.data
  return (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      destroyOnHidden
      items={[
        {
          key: 'profile',
          label: '账号资料',
          children: (
            <>
              <Button
                className="mb-4"
                disabled={detail.isFetching}
                onClick={() => void detail.refetch()}
              >
                刷新详情
              </Button>
              <Descriptions
                column={1}
                items={[
                  { key: 'id', label: '用户 ID', children: row.id },
                  { key: 'name', label: '昵称', children: row.name },
                  { key: 'email', label: '邮箱', children: row.email },
                  {
                    key: 'verified',
                    label: '邮箱验证',
                    children: row.emailVerified ? '已验证' : '未验证',
                  },
                  { key: 'connection', label: '连接状态', children: status(row.connectionStatus) },
                  { key: 'created', label: '注册时间', children: time(row.createdAt) },
                  { key: 'updated', label: '更新时间', children: time(row.updatedAt) },
                  {
                    key: 'session',
                    label: '最近有效会话创建时间',
                    children: time(row.latestSessionCreatedAt),
                  },
                  { key: 'feedback', label: '有效自有反馈数', children: row.feedbackCount },
                ]}
              />
            </>
          ),
        },
        ...(['credentials', 'reports', 'sessions'] as const).map((resource) => ({
          key: resource,
          label: { credentials: '账号连接', reports: '阅读报告', sessions: '用户会话' }[resource],
          children: <ResourceTable sessionId={sessionId} resource={resource} userId={id} />,
        })),
      ]}
    />
  )
}
