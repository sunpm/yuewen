import { ArrowUpRight, Palette } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { ErrorBoundary } from '@/components/error-boundary'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTheme } from '@/hooks/use-theme'
import { accountNavigation, navigation, pageTitle } from '@/navigation'

const Home = lazy(() => import('@/pages/home'))
const Workspace = lazy(() => import('@/pages/workspace'))

export default function App() {
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const main = useRef<HTMLElement>(null)
  const previousKey = useRef(location.key)
  const title = pageTitle(location.pathname)

  useEffect(() => {
    document.title = `${title} · 阅纹`
    if (previousKey.current !== location.key) {
      window.scrollTo(0, 0)
      main.current?.focus()
      previousKey.current = location.key
    }
  }, [title, location.key])

  return (
    <>
      <a className="skip-link" href="#main">
        跳至主要内容
      </a>
      <div className="app-shell">
        <aside className="sidebar" aria-label="阅纹导航">
          <Link to="/" className="brand" aria-label="阅纹首页">
            <img
              className="logo-light"
              src="/brand/logo-mark-light.svg"
              width="32"
              height="26"
              alt=""
            />
            <img
              className="logo-dark"
              src="/brand/logo-mark-dark.svg"
              width="32"
              height="26"
              alt=""
            />
            <span className="nav-label">阅纹</span>
          </Link>
          <nav className="primary-nav" aria-label="主导航">
            <span className="nav-caption nav-label">阅读档案</span>
            {navigation.map(({ path, title: label, icon: Icon }) => (
              <NavLink
                key={path}
                to={{ pathname: path, search: location.search }}
                end
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                aria-label={label}
                title={label}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <nav aria-label="账号与连接">
              {accountNavigation.map(({ path, title: label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={{ pathname: path, search: location.search }}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  aria-label={label}
                  title={label}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="nav-label">{label}</span>
                </NavLink>
              ))}
            </nav>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger aria-label="选择主题" className="theme-trigger">
                <Palette size={17} aria-hidden="true" />
                <span className="nav-label">
                  <SelectValue>
                    {theme === 'auto' ? '自动' : theme === 'light' ? '浅色' : '深色'}
                  </SelectValue>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动（跟随系统）</SelectItem>
                <SelectItem value="light">浅色</SelectItem>
                <SelectItem value="dark">深色</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </aside>
        <div className="workspace">
          <header className="page-header">
            <h1>{title}</h1>
            <Link className="text-link" to="/demo">
              探索示例 <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </header>
          <main id="main" ref={main} tabIndex={-1} className="page-content">
            <p className="preview-note">
              <span aria-hidden="true" />
              界面预览 · 暂不连接账号或读取数据
            </p>
            <ErrorBoundary key={location.key}>
              <Suspense
                fallback={
                  <p className="route-loading" role="status">
                    正在打开页面…
                  </p>
                }
              >
                <Routes>
                  <Route path="/" element={<Home />} />
                  {[...navigation.slice(1), ...accountNavigation, { path: '/demo' }].map(
                    ({ path }) => (
                      <Route key={path} path={path} element={<Workspace />} />
                    ),
                  )}
                  <Route
                    path="*"
                    element={
                      <section className="empty-state">
                        <h2>这一页还没有留下纹理</h2>
                        <p>地址可能有误，请从侧栏选择页面。</p>
                        <Link className="text-link" to="/">
                          返回首页
                        </Link>
                      </section>
                    }
                  />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
          <footer className="page-footer">每一页，都留下你的纹理。</footer>
        </div>
      </div>
    </>
  )
}
