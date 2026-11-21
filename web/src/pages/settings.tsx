import { api } from '@client/api'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { message, refreshConnections, useConnections } from '@/lib/business'
export default function Settings() {
  const connection = useConnections()
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  async function clear() {
    setBusy(true)
    setError('')
    try {
      await api('/session/reports', { method: 'DELETE' })
      setConfirm(false)
      await refreshConnections()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="settings-page">
      <h2>微信读书连接</h2>
      <p>
        此实例不设阅纹账号。微信读书读取授权由实例部署者管理，报告只向通过部署访问保护的访问者开放。
      </p>
      {connection.isPending ? (
        <p role="status">正在检查连接…</p>
      ) : connection.error ? (
        <p role="alert">{message(connection.error)}</p>
      ) : (
        <p>
          上游授权：
          {connection.data?.instance.status === 'valid'
            ? '已配置（尚未验证有效性）'
            : '尚未配置，请联系实例部署者'}
        </p>
      )}
      <Button variant="outline" onClick={() => void connection.refetch()}>
        重新检查
      </Button>
      <p>
        <a
          className="text-link"
          href="https://weread.qq.com/r/weread-skills"
          target="_blank"
          rel="noreferrer"
        >
          获取微信读书读取授权
        </a>
      </p>
      <Link className="text-link" to="/overview?connection=instance">
        查看报告
      </Link>
      <h2>当前报告</h2>
      <p>当前采集结果保留两小时。长期保留请选择保存报告或下载；清除当前报告不会删除历史存档。</p>
      {confirm ? (
        <>
          <Button disabled={busy} onClick={() => void clear()}>
            确认清除当前报告
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            取消
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={() => setConfirm(true)}>
          清除当前报告
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
