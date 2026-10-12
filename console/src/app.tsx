import { Alert, Button, Layout, Result, Spin, Typography } from 'antd'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { auth, clearConsoleCache, requireOnline } from './session'

const Login = lazy(() => import('./login'))
const Overview = lazy(() => import('./overview'))
const Feedback = lazy(() => import('./feedback'))

export default function App() {
  const session = auth.useSession()
  const location = useLocation()
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const refetch = session.refetch
  const sessionId = session.data?.session.id
  const expiry = session.data ? new Date(session.data.session.expiresAt).getTime() : 0
  const unavailable =
    session.isPending ||
    session.isRefetching ||
    !!session.error ||
    offline ||
    leaving ||
    !sessionId ||
    expiry <= Date.now()

  useEffect(() => {
    clearConsoleCache(unavailable ? undefined : sessionId)
  }, [unavailable, sessionId])
  useEffect(() => () => clearConsoleCache(), [])
  useEffect(() => {
    const recover = () => {
      setOffline(!navigator.onLine)
      void refetch()
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') recover()
    }
    const disconnect = () => setOffline(true)
    window.addEventListener('online', recover)
    window.addEventListener('offline', disconnect)
    window.addEventListener('focus', recover)
    document.addEventListener('visibilitychange', visibility)
    const timer =
      expiry > Date.now() ? setTimeout(() => void refetch(), expiry - Date.now()) : undefined
    return () => {
      window.removeEventListener('online', recover)
      window.removeEventListener('offline', disconnect)
      window.removeEventListener('focus', recover)
      document.removeEventListener('visibilitychange', visibility)
      clearTimeout(timer)
    }
  }, [refetch, expiry])
  async function signOut() {
    if (leaving) return
    setLeaving(true)
    setError('')
    clearConsoleCache()
    try {
      requireOnline()
      const result = await auth.signOut()
      if (result.error) throw new Error('sign-out failed')
      await refetch()
    } catch {
      setError('退出尚未确认，请联网后重试。')
      // Keep management data hidden until the user explicitly retries or verifies the session.
      return
    }
    setLeaving(false)
  }
  if (leaving && error)
    return (
      <Result
        status="warning"
        title={error}
        extra={
          <Button
            onClick={() => {
              setLeaving(false)
              setError('')
              void refetch()
            }}
          >
            重新核验会话
          </Button>
        }
      />
    )
  if (offline || session.error)
    return (
      <Result
        status="warning"
        title={offline ? '当前离线' : '无法核验管理会话'}
        subTitle="联网后可以重新核验，未完成的操作不会自动提交。"
        extra={<Button onClick={() => void refetch()}>重新核验</Button>}
      />
    )
  if (session.isPending || session.isRefetching || leaving)
    return (
      <div className="grid min-h-screen place-items-center" role="status">
        <Spin description="正在核验管理会话">
          <div className="p-12" />
        </Spin>
      </div>
    )
  if (!session.data || expiry <= Date.now())
    return (
      <Suspense fallback={<Spin />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="*"
            element={<Navigate to="/login" replace state={{ returnTo: location.pathname }} />}
          />
        </Routes>
      </Suspense>
    )
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo
  return (
    <Layout className="min-h-screen">
      <Layout.Header
        className="flex items-center justify-between gap-4"
        style={{ background: 'transparent', paddingInline: 24 }}
      >
        <Typography.Text strong>阅纹 · 管理后台</Typography.Text>
        <div className="flex items-center gap-4">
          <Link to="/">概览</Link>
          <Link to="/feedback">意见反馈</Link>
          <a href="/">返回阅纹</a>
          <Button onClick={() => void signOut()}>退出登录</Button>
        </div>
      </Layout.Header>
      <Layout.Content className="px-6 py-8">
        {error && <Alert type="error" title={error} />}
        <Suspense fallback={<Spin />}>
          <Routes>
            <Route
              path="/login"
              element={
                <Navigate
                  to={
                    returnTo?.startsWith('/') && !returnTo.startsWith('//') && returnTo !== '/login'
                      ? returnTo
                      : '/'
                  }
                  replace
                />
              }
            />
            <Route
              path="/"
              element={
                <Overview
                  sessionId={session.data.session.id}
                  username={session.data.user.username ?? '管理员'}
                  expiresAt={session.data.session.expiresAt}
                />
              }
            />
            <Route path="/feedback" element={<Feedback sessionId={session.data.session.id} />} />
            <Route
              path="*"
              element={
                <Result
                  status="404"
                  title="页面尚未开放"
                  extra={<a href="/console/">返回后台概览</a>}
                />
              }
            />
          </Routes>
        </Suspense>
      </Layout.Content>
    </Layout>
  )
}
