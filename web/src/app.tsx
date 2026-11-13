import { Monitor, Moon, Sun } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { ErrorBoundary } from '@/components/error-boundary'
import { Feedback } from '@/components/feedback'
import { useTheme } from '@/hooks/use-theme'
import { accountNavigation, navigation, pageTitle, readingPath, reportView } from '@/navigation'

const Home = lazy(() => import('@/pages/home'))
const Workspace = lazy(() => import('@/pages/workspace'))
const Account = lazy(() => import('@/pages/account'))
const Archives = lazy(() => import('@/pages/archives'))

export default function App() {
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const main = useRef<HTMLElement>(null)
  const previousKey = useRef(location.key)
  const title = pageTitle(location.pathname, location.search)
  const currentPath = location.pathname.replace(/\/+$/, '') || '/'
  const activePath =
    currentPath === '/demo' || currentPath.startsWith('/archives/')
      ? `/${reportView(currentPath, location.search)}`
      : currentPath

  useEffect(() => {
    document.title = `${title} · 阅纹`
    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute('content', currentPath === '/' ? 'index, follow' : 'noindex, nofollow')
    if (previousKey.current !== location.key) {
      window.scrollTo(0, 0)
      main.current?.focus({ preventScroll: true })
      previousKey.current = location.key
    }
  }, [title, location.key, currentPath])

  return (
    <>
      <a className="skip-link" href="#main">
        跳至主要内容
      </a>
      <div className="app-shell">
        <header className="site-header">
          <div className="site-header-inner">
            <Link to="/" className="brand" aria-label="阅纹首页">
              <img
                className="logo-light"
                src="/brand/logo-mark-light.svg"
                width="32"
                height="32"
                alt=""
              />
              <img
                className="logo-dark"
                src="/brand/logo-mark-dark.svg"
                width="32"
                height="32"
                alt=""
              />
              <span className="brand-name">阅纹</span>
            </Link>
            <nav className="primary-nav" aria-label="主导航">
              {navigation.slice(1).map(({ path, title: label }) => (
                <Link
                  key={path}
                  to={readingPath(location.pathname, location.search, path.slice(1))}
                  className={`nav-link${path === activePath ? ' active' : ''}`}
                  aria-current={path === activePath ? 'page' : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="header-actions">
              <nav className="utility-nav" aria-label="账号与连接">
                {accountNavigation.map(({ path, title: label, icon: Icon }) => (
                  <NavLink
                    key={path}
                    to={{ pathname: path, search: location.search }}
                    className={({ isActive }) => `utility-link${isActive ? ' active' : ''}`}
                    aria-label={label}
                    title={label}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="utility-label">{label}</span>
                  </NavLink>
                ))}
                <Feedback key={location.key} />
              </nav>
              <fieldset className="theme-switcher">
                <legend className="sr-only">主题</legend>
                {[
                  { value: 'auto', label: '自动', icon: Monitor },
                  { value: 'light', label: '浅色', icon: Sun },
                  { value: 'dark', label: '深色', icon: Moon },
                ].map(({ value, label, icon: Icon }) => (
                  <label
                    key={value}
                    className="theme-option"
                    title={value === 'auto' ? '自动（跟随系统）' : label}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="yuewen-theme"
                      value={value}
                      checked={theme === value}
                      onChange={() => setTheme(value)}
                      aria-label={value === 'auto' ? '自动（跟随系统）' : label}
                    />
                    <span className="theme-choice">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          </div>
        </header>
        <div className="workspace">
          <main id="main" ref={main} tabIndex={-1} className="page-content">
            <h1 className={currentPath === '/' ? 'sr-only' : 'page-title'}>{title}</h1>
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
                  {[...navigation.slice(1), { path: '/demo' }].map(({ path }) => (
                    <Route key={path} path={path} element={<Workspace />} />
                  ))}
                  <Route path="/archives" element={<Archives />} />
                  <Route path="/archives/:id" element={<Archives />} />
                  <Route path="/settings" element={<Account />} />
                  <Route path="/login" element={<Account />} />
                  <Route
                    path="*"
                    element={
                      <section className="empty-state">
                        <h2>这一页还没有留下纹理</h2>
                        <p>地址可能有误，请从顶部导航选择页面。</p>
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
