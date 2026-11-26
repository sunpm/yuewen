import { api } from '@client/api'
import { ArrowRight, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { message, refreshConnections, useConnections } from '@/lib/business'

export default function Settings() {
  const connection = useConnections()
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const valid = connection.data?.instance.status === 'valid'

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
      <div className="data-panel settings-connection">
        <div className="settings-heading">
          <h2>微信读书连接</h2>
          {connection.isPending ? (
            <span className="settings-badge" role="status">
              正在检查连接…
            </span>
          ) : connection.error ? (
            <span className="settings-badge is-error" role="alert">
              连接检查失败
            </span>
          ) : (
            <span className={`settings-badge ${valid ? 'is-ready' : 'is-warn'}`}>
              {valid ? '已配置（尚未验证有效性）' : '尚未配置'}
            </span>
          )}
        </div>

        <p className="muted-copy">
          此实例不设阅纹账号。微信读书读取授权由实例部署者管理，报告只向通过部署访问保护的访问者开放。
        </p>

        {connection.error && (
          <p role="alert" className="settings-inline-alert">
            {message(connection.error)}
          </p>
        )}

        {!connection.isPending && !connection.error && !valid && (
          <p className="settings-inline-note">
            当前尚未配置上游授权，请联系实例部署者在环境密钥中添加读取授权。
          </p>
        )}

        <div className="settings-actions">
          <Button variant={valid ? 'default' : 'outline'} asChild>
            <Link to="/overview?connection=instance">
              查看报告 <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={connection.isFetching}
            onClick={() => void connection.refetch()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {connection.isFetching ? '正在检查…' : '重新检查'}
          </Button>
          <a
            className="text-link"
            href="https://weread.qq.com/r/weread-skills"
            target="_blank"
            rel="noreferrer"
          >
            获取微信读书读取授权 <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="settings-maintenance">
        <div className="settings-action-row">
          <div>
            <h2>当前报告</h2>
            <p className="muted-copy">
              当前采集结果保留两小时。长期保留请选择保存报告或下载；清除当前报告不会删除历史存档。
            </p>
          </div>
          <Link className="text-link" to="/archives">
            查看历史报告 <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="settings-danger-box">
          {confirm ? (
            <div className="settings-confirm-bar">
              <span>确认清除当前报告？已保存的历史存档不受影响。</span>
              <div className="connection-actions">
                <Button variant="destructive" disabled={busy} onClick={() => void clear()}>
                  {busy ? '正在清除…' : '确认清除当前报告'}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setConfirm(true)}>
              <Trash2 size={15} aria-hidden="true" />
              清除当前报告
            </Button>
          )}
          {error && (
            <p role="alert" className="settings-inline-alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
