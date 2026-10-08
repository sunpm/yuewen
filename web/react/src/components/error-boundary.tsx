import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="empty-state" role="alert" aria-label="页面加载失败">
        <h2>页面暂时无法打开</h2>
        <p>可以刷新后重试。刷新会清除本页尚未提交的内容。</p>
        <Button onClick={() => window.location.reload()}>刷新页面</Button>
        <a className="text-link" href="/">
          返回首页
        </a>
      </section>
    )
  }
}
