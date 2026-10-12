import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Input,
  Result,
  Space,
  Table,
  type TableColumnsType,
  Tabs,
  Typography,
} from 'antd'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { type ManagementReason, managementReasons } from '../../shared/console'
import { type PageResult, ReadError, status, time } from './data-display'
import { type ActionTarget, ManagementAction } from './management-action'
import { consoleRequest } from './session'

const resources = {
  credentials: '账号连接',
  guests: '游客连接',
  reports: '阅读报告',
  sessions: '用户会话',
  audit: '管理审计',
  'cleanup-stats': '清理统计',
}
type Resource = keyof typeof resources
type PagedResource = Exclude<Resource, 'cleanup-stats'>
type Timestamps = { createdAt: string; updatedAt: string }
type CredentialRow = Timestamps & {
  userId: string
  status: string
  version: number
  validatedAt: string | null
}
type GuestRow = Timestamps & {
  id: string
  status: string
  version: number
  idleExpiresAt: string
  expiresAt: string
}
type ReportRow = GuestRow & {
  userId: string | null
  guestId: string | null
  keyVersion: number
  rangeKey: string | null
  rangeStart: string | null
  rangeEnd: string | null
  requests: number | null
  noteCount: number | null
  notebookCount: number | null
  pendingCount: number | null
  failedCount: number | null
}
type SessionRow = Timestamps & { id: string; userId: string; expiresAt: string }
type AuditRow = {
  id: string
  actorId: string | null
  action: string
  targetId: string
  result: string
  reason: ManagementReason | null
  createdAt: string
  expiresAt: string
}
type DataRow = CredentialRow | GuestRow | ReportRow | SessionRow | AuditRow

const created = { title: '创建时间', dataIndex: 'createdAt', render: time }
const updated = { title: '更新时间', dataIndex: 'updatedAt', render: time }
const expires = { title: '到期时间', dataIndex: 'expiresAt', render: time }
const idleExpires = { title: '闲置期限', dataIndex: 'idleExpiresAt', render: time }
const state = { title: '状态', dataIndex: 'status', render: status }
const version = { title: '版本', dataIndex: 'version' }
const identifier = (value: string | null) => <span className="break-all">{value ?? '—'}</span>
const userColumn = { title: '用户 ID', dataIndex: 'userId', render: identifier }
const columns: Record<PagedResource, TableColumnsType<DataRow>> = {
  credentials: [
    userColumn,
    state,
    version,
    { title: '验证时间', dataIndex: 'validatedAt', render: time },
    created,
    updated,
  ],
  guests: [
    { title: '游客 ID', dataIndex: 'id', render: identifier },
    state,
    version,
    idleExpires,
    expires,
    created,
    updated,
  ],
  reports: [
    { title: '报告 ID', dataIndex: 'id', render: identifier },
    userColumn,
    { title: '游客 ID', dataIndex: 'guestId', render: identifier },
    state,
    version,
    { title: '连接版本', dataIndex: 'keyVersion' },
    { title: '范围', dataIndex: 'rangeKey' },
    { title: '范围起点', dataIndex: 'rangeStart' },
    { title: '范围终点', dataIndex: 'rangeEnd' },
    { title: '请求数', dataIndex: 'requests' },
    { title: '笔记数', dataIndex: 'noteCount' },
    { title: '笔记本数', dataIndex: 'notebookCount' },
    { title: '待处理数', dataIndex: 'pendingCount' },
    { title: '失败数', dataIndex: 'failedCount' },
    idleExpires,
    expires,
    created,
    updated,
  ],
  sessions: [
    { title: '会话 ID', dataIndex: 'id', render: identifier },
    userColumn,
    created,
    updated,
    expires,
  ],
  audit: [
    { title: '审计 ID', dataIndex: 'id', render: identifier },
    { title: '管理员 ID', dataIndex: 'actorId', render: identifier },
    { title: '动作', dataIndex: 'action' },
    { title: '对象 ID', dataIndex: 'targetId', render: identifier },
    { title: '结果', dataIndex: 'result' },
    {
      title: '操作原因',
      dataIndex: 'reason',
      render: (value: ManagementReason | null) =>
        value ? (managementReasons[value] ?? value) : '—',
    },
    created,
    expires,
  ],
}
const filterSchema = z.object({
  userId: z.string().trim().max(128, '用户 ID 最多 128 字。'),
  guestId: z.string().trim().max(128, '游客 ID 最多 128 字。'),
})

export default function Data({ sessionId }: { sessionId: string }) {
  const { resource = 'credentials' } = useParams()
  const navigate = useNavigate()
  if (!Object.hasOwn(resources, resource))
    return (
      <Result status="404" title="数据页面不存在" extra={<Link to="/data">返回数据管理</Link>} />
    )
  return (
    <section>
      <Typography.Title level={1} style={{ fontSize: 28 }}>
        数据管理
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        查询连接、报告和会话元信息，以及管理审计和清理统计。已过期记录可能仍在等待定时清理。
      </Typography.Paragraph>
      <Tabs
        activeKey={resource}
        onChange={(key) => navigate(`/data/${key}`)}
        destroyOnHidden
        items={Object.entries(resources).map(([key, label]) => ({
          key,
          label,
          children:
            key === 'cleanup-stats' ? (
              <CleanupStats sessionId={sessionId} />
            ) : (
              <ResourceTable key={key} sessionId={sessionId} resource={key as PagedResource} />
            ),
        }))}
      />
    </section>
  )
}

export function ResourceTable({
  sessionId,
  resource,
  userId,
}: {
  sessionId: string
  resource: PagedResource
  userId?: string
}) {
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 })
  const [filter, setFilter] = useState('')
  const [target, setTarget] = useState<ActionTarget | null>(null)
  const [notice, setNotice] = useState('')
  const userFilter = !userId && ['credentials', 'reports', 'sessions'].includes(resource)
  const guestFilter = !userId && ['guests', 'reports'].includes(resource)
  const form = useForm({
    resolver: zodResolver(filterSchema),
    defaultValues: { userId: '', guestId: '' },
  })
  const list = useQuery({
    queryKey: ['console', sessionId, 'data', resource, userId, pagination, filter],
    queryFn: ({ signal }) =>
      consoleRequest<PageResult<DataRow>>(
        `/data/${resource}?page=${pagination.page}&pageSize=${pagination.pageSize}${userId ? `&userId=${encodeURIComponent(userId)}` : filter}`,
        signal,
      ),
    gcTime: 0,
  })
  return (
    <>
      {notice && (
        <Alert
          className="mb-4"
          type="success"
          title={notice}
          closable
          onClose={() => setNotice('')}
        />
      )}
      <form
        aria-label={`${resources[resource]}筛选`}
        className="mb-4 flex flex-wrap items-end gap-4"
        onSubmit={form.handleSubmit((values) => {
          const params = new URLSearchParams()
          if (userFilter && values.userId) params.set('userId', values.userId)
          if (guestFilter && values.guestId) params.set('guestId', values.guestId)
          setPagination((current) => ({ ...current, page: 1 }))
          setFilter(`&${params}`)
        })}
      >
        {userFilter && (
          <div>
            <label htmlFor={`${resource}-user`} className="mb-2 block">
              用户 ID（精确匹配）
            </label>
            <Controller
              name="userId"
              control={form.control}
              render={({ field }) => (
                <Input {...field} id={`${resource}-user`} autoComplete="off" maxLength={128} />
              )}
            />
            {form.formState.errors.userId && (
              <p role="alert">{form.formState.errors.userId.message}</p>
            )}
          </div>
        )}
        {guestFilter && (
          <div>
            <label htmlFor={`${resource}-guest`} className="mb-2 block">
              游客 ID（精确匹配）
            </label>
            <Controller
              name="guestId"
              control={form.control}
              render={({ field }) => (
                <Input {...field} id={`${resource}-guest`} autoComplete="off" maxLength={128} />
              )}
            />
            {form.formState.errors.guestId && (
              <p role="alert">{form.formState.errors.guestId.message}</p>
            )}
          </div>
        )}
        {(userFilter || guestFilter) && (
          <>
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
          </>
        )}
        <Button disabled={list.isFetching} onClick={() => void list.refetch()}>
          刷新
        </Button>
      </form>
      {list.error ? (
        <ReadError error={list.error} loading={list.isFetching} retry={() => void list.refetch()} />
      ) : (
        <Table<DataRow>
          rowKey={resource === 'credentials' ? 'userId' : 'id'}
          loading={list.isFetching}
          dataSource={list.data?.items ?? []}
          columns={[
            ...columns[resource],
            ...(resource === 'audit'
              ? []
              : [
                  {
                    title: '操作',
                    key: 'actions',
                    fixed: 'right' as const,
                    width: resource === 'reports' ? 180 : 110,
                    render: (_: unknown, row: DataRow) => {
                      const id =
                        resource === 'credentials' && 'userId' in row
                          ? row.userId
                          : 'id' in row
                            ? row.id
                            : null
                      if (!id || !('updatedAt' in row)) return null
                      const expected = {
                        id,
                        updatedAt: row.updatedAt,
                        ...('version' in row ? { version: row.version } : {}),
                      }
                      return resource === 'reports' ? (
                        <Space>
                          <Button
                            disabled={
                              !('status' in row) || !['queued', 'running'].includes(row.status)
                            }
                            onClick={() => setTarget({ ...expected, action: 'report.stop' })}
                          >
                            停止
                          </Button>
                          <Button
                            danger
                            onClick={() => setTarget({ ...expected, action: 'report.clear' })}
                          >
                            清除
                          </Button>
                        </Space>
                      ) : (
                        <Button
                          danger
                          onClick={() =>
                            setTarget({
                              ...expected,
                              action: {
                                credentials: 'credential.revoke',
                                guests: 'guest.revoke',
                                sessions: 'session.revoke',
                              }[resource] as ActionTarget['action'],
                            })
                          }
                        >
                          撤销
                        </Button>
                      )
                    },
                  },
                ]),
          ]}
          scroll={{ x: resource === 'reports' ? 2800 : 1100 }}
          locale={{ emptyText: '没有符合条件的记录' }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: list.data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) =>
              setPagination({ page: pageSize === pagination.pageSize ? page : 1, pageSize }),
          }}
        />
      )}
      {target && (
        <ManagementAction
          target={target}
          sessionId={sessionId}
          close={() => setTarget(null)}
          done={setNotice}
        />
      )}
    </>
  )
}

type CleanupRow = { resource: string; total: number; expired: number }
const cleanupLabels: Record<string, string> = {
  auth_rate_limit: '认证限流',
  request_limit: '业务请求限流',
  connection_save: '保存连接回执',
  report_replacement: '报告替换回执',
}
function CleanupStats({ sessionId }: { sessionId: string }) {
  const stats = useQuery({
    queryKey: ['console', sessionId, 'data', 'cleanup-stats'],
    queryFn: ({ signal }) => consoleRequest<{ items: CleanupRow[] }>('/data/cleanup-stats', signal),
    gcTime: 0,
  })
  return (
    <>
      <Typography.Paragraph type="secondary">
        认证限流统计最后请求超过 24
        小时的记录；其余按到期时间统计。刷新只更新数量，清理由定时任务执行。
      </Typography.Paragraph>
      <Button className="mb-4" disabled={stats.isFetching} onClick={() => void stats.refetch()}>
        刷新
      </Button>
      {stats.error ? (
        <ReadError
          error={stats.error}
          loading={stats.isFetching}
          retry={() => void stats.refetch()}
        />
      ) : (
        <Table<CleanupRow>
          rowKey="resource"
          loading={stats.isFetching}
          dataSource={stats.data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: '数据',
              dataIndex: 'resource',
              render: (value: string) => cleanupLabels[value] ?? value,
            },
            { title: '总记录数', dataIndex: 'total' },
            { title: '已过期 / 待清理', dataIndex: 'expired' },
          ]}
        />
      )}
    </>
  )
}
