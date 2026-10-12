// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../console/src/app'
import Login from '../../console/src/login'
import { clearConsoleCache, queries } from '../../console/src/session'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  refetch: vi.fn().mockResolvedValue(undefined),
  session: {
    data: null as null | { user: { username: string }; session: { id: string; expiresAt: Date } },
    isPending: false,
    isRefetching: false,
    error: null as null | { status: number },
  },
}))
vi.mock('../../console/src/session', async (original) => ({
  ...(await original<typeof import('../../console/src/session')>()),
  auth: {
    signIn: { username: mocks.login },
    signOut: mocks.logout,
    useSession: () => ({ ...mocks.session, refetch: mocks.refetch }),
    $store: { notify: vi.fn() },
  },
}))
function renderApp(path = '/') {
  return render(
    <QueryClientProvider client={queries}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
function signedIn() {
  mocks.session.data = {
    user: { username: 'test_admin' },
    session: { id: 'session-a', expiresAt: new Date(Date.now() + 3600_000) },
  }
}
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ready' })))
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  mocks.session = { data: null, isPending: false, isRefetching: false, error: null }
  mocks.login.mockReset()
  mocks.logout.mockReset()
  mocks.refetch.mockClear()
})
afterEach(() => {
  cleanup()
  clearConsoleCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('后台登录与会话恢复', () => {
  it('字段校验给出中文错误并聚焦；提交中不重复登录，失败后清除密码', async () => {
    let finish!: (value: unknown) => void
    mocks.login.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<Login />)
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await screen.findByText('请输入管理员账号。')
    expect(mocks.login).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('管理员账号')))
    fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'test_admin' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'example-password' } })
    fireEvent.submit(screen.getByRole('form', { name: '管理员登录' }))
    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
    fireEvent.submit(screen.getByRole('form', { name: '管理员登录' }))
    expect(mocks.login).toHaveBeenCalledTimes(1)
    await act(async () => finish({ error: { status: 401 } }))
    await screen.findByText('账号或密码不正确。')
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('管理员账号') as HTMLInputElement).value).toBe('test_admin')
  })
  it('离线不提交凭据，恢复网络不自动重放登录', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<Login />)
    fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'test_admin' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'example-password' } })
    fireEvent.submit(screen.getByRole('form', { name: '管理员登录' }))
    await screen.findByText('登录未完成，请确认网络后主动重试。')
    fireEvent(window, new Event('online'))
    expect(mocks.login).not.toHaveBeenCalled()
  })
  it('离开登录表单会取消请求，迟到错误不会恢复旧表单', async () => {
    let finish!: (value: unknown) => void
    mocks.login.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<Login />)
    fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'test_admin' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'example-password' } })
    fireEvent.submit(screen.getByRole('form', { name: '管理员登录' }))
    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
    const signal = mocks.login.mock.calls[0][0].fetchOptions.signal as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
    render(<Login />)
    await act(async () => finish({ error: { status: 401 } }))
    expect(screen.queryByText('账号或密码不正确。')).toBeNull()
  })
  it('会话重新核验或失效立即隐藏管理内容，取消的迟到查询不恢复缓存', async () => {
    signedIn()
    const view = renderApp()
    await screen.findByText('后台概览')
    let finish!: (value: string) => void
    const pending = queries
      .fetchQuery({
        queryKey: ['console', 'session-a', 'private'],
        queryFn: ({ signal }) => {
          expect(signal.aborted).toBe(false)
          return new Promise<string>((resolve) => {
            finish = resolve
          })
        },
      })
      .catch(() => undefined)
    mocks.session.isRefetching = true
    view.rerender(
      <QueryClientProvider client={queries}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.queryByText('后台概览')).toBeNull()
    await waitFor(() => expect(queries.getQueryCache().getAll()).toHaveLength(0))
    await act(async () => {
      finish('late private result')
      await pending
    })
    expect(queries.getQueryData(['console', 'session-a', 'private'])).toBeUndefined()
    mocks.session.isRefetching = false
    mocks.session.data = null
    view.rerender(
      <QueryClientProvider client={queries}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByLabelText('管理员账号')
  })
  it('聚焦和重连仅核验会话，退出失败隐藏数据且不自动重试写入', async () => {
    signedIn()
    mocks.logout.mockResolvedValue({ error: { status: 503 } })
    renderApp()
    await screen.findByText('后台概览')
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    await screen.findByText('退出尚未确认，请联网后重试。')
    expect(screen.queryByText('后台概览')).toBeNull()
    fireEvent(window, new Event('focus'))
    fireEvent(window, new Event('online'))
    expect(mocks.refetch).toHaveBeenCalled()
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(queries.getQueryCache().getAll()).toHaveLength(0)
  })
  it('用户深链接先登录，核验成功后进入用户管理页面', async () => {
    // jsdom has no layout engine; this case verifies routing and the authenticated query.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      },
    )
    const computedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => computedStyle(element))
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ items: [], total: 0, page: 1, pageSize: 20 }),
    )
    const view = renderApp('/users')
    await screen.findByLabelText('管理员账号')
    signedIn()
    view.rerender(
      <QueryClientProvider client={queries}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByRole('heading', { name: '用户管理' })
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/console/users?page=1&pageSize=20',
        expect.objectContaining({ signal: expect.any(AbortSignal), credentials: 'same-origin' }),
      ),
    )
    expect(screen.queryByText('后台概览')).toBeNull()
  })
})
