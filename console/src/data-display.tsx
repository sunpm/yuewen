import { ApiError } from '@client/api'
import { Alert, Button, Tag } from 'antd'

export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number }

export const time = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'

export const connectionLabels = { unconfigured: '未配置', valid: '有效', invalid: '失效' }

const statusLabels: Record<string, string> = {
  ...connectionLabels,
  queued: '待采集',
  running: '采集中',
  completed: '已完成',
  partial: '部分完成',
  cancelled: '已停止',
  failed: '失败',
}

export const status = (value: string) => <Tag>{statusLabels[value] ?? value}</Tag>

export function ReadError({
  error,
  retry,
  loading,
}: {
  error: unknown
  retry: () => void
  loading: boolean
}) {
  const disabled = error instanceof ApiError && error.code === 'CONSOLE_DATA_UNAVAILABLE'
  return (
    <Alert
      type={disabled ? 'info' : 'error'}
      title={error instanceof Error ? error.message : '读取失败，请重试。'}
      description={disabled ? '此环境尚未开放用户与数据管理。启用后可刷新读取。' : undefined}
      action={
        <Button loading={loading} onClick={retry}>
          重试
        </Button>
      }
    />
  )
}
