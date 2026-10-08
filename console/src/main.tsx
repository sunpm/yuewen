import '@client/fonts.css'
import './styles.css'
import { StyleProvider } from '@ant-design/cssinjs'
import { QueryClientProvider } from '@tanstack/react-query'
import { Button, ConfigProvider, Result, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Component, type ReactNode, StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './app'
import { queries } from './session'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <Result
        status="error"
        title="页面加载失败"
        subTitle="刷新后重试，尚未提交的内容会清除。"
        extra={<Button onClick={() => window.location.reload()}>刷新页面</Button>}
      />
    ) : (
      this.props.children
    )
  }
}
function Root() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#ba751b',
            colorBgLayout: dark ? '#111213' : '#f5efe3',
            fontFamily: 'var(--font-reading)',
            borderRadius: 8,
          },
        }}
      >
        <ErrorBoundary>
          <QueryClientProvider client={queries}>
            <BrowserRouter basename="/console">
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </ErrorBoundary>
      </ConfigProvider>
    </StyleProvider>
  )
}
const root = document.getElementById('app')
if (!root) throw new Error('Missing app root')
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
