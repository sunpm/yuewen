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
      <Card title="访问与性能统计" className="mb-6">
        <Typography.Paragraph>
          Cloudflare Web Analytics 提供生产 PC 首页和模拟示例的访问与性能数据。
          站点未启用或请求被拦截时不会产生数据，私有页面与业务转化不在统计范围内。
        </Typography.Paragraph>
        <Button
          href="https://dash.cloudflare.com/?to=/:account/web-analytics"
          target="_blank"
          rel="noopener noreferrer"
        >
          打开 Cloudflare 统计
        </Button>
      </Card>
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
