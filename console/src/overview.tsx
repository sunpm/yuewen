import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Descriptions, Typography } from 'antd'
import { consoleRequest } from './session'

export default function Overview({
  sessionId,
  username,
  expiresAt,
}: {
  sessionId: string
  username: string
  expiresAt: Date
}) {
  const overview = useQuery({
    queryKey: ['console', sessionId, 'overview'],
    queryFn: ({ signal }) => consoleRequest<{ status: string }>('/overview', signal),
  })
  return (
    <section className="max-w-3xl">
      <Typography.Title level={1} style={{ fontSize: 28 }}>
        后台概览
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        可从导航处理意见反馈、查询用户及连接、报告、会话等运行元信息。
      </Typography.Paragraph>
      {overview.error ? (
        <Alert
          type="error"
          title="无法读取后台状态"
          description="请确认网络后重试。"
          action={<Button onClick={() => void overview.refetch()}>重试</Button>}
        />
      ) : (
        <Card loading={overview.isPending} title="当前会话">
          <Descriptions
            column={1}
            items={[
              { key: 'username', label: '管理员', children: username },
              {
                key: 'expires',
                label: '登录有效期至',
                children: new Date(expiresAt).toLocaleString('zh-CN', { hour12: false }),
              },
            ]}
          />
        </Card>
      )}
    </section>
  )
}
