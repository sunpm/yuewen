import { afterEach, describe, expect, it, vi } from 'vitest'
import { weread, SKILL_VERSION } from '../server/weread'
import { app } from '../server/app'
import { createDemo } from '../shared/demo'
import { escapeHtml, exportData, makeHtml } from '../client/export'
afterEach(() => vi.unstubAllEnvs())
describe('凭证与上游边界', () => {
  it('仅向固定官方网关提交 Key，接口版本与参数位于顶层', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ books: [] }))
    await weread('wrk-test', '/user/notebooks', { count: 10, lastSort: 8 }, fetcher)
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://i.weread.qq.com/api/agent/gateway')
    expect(JSON.parse(String(options?.body))).toEqual({
      api_name: '/user/notebooks',
      skill_version: SKILL_VERSION,
      count: 10,
      lastSort: 8,
    })
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer wrk-test' })
  })
  it.each([
    [401, {}, 'WEREAD_KEY_INVALID'],
    [403, { errcode: 7 }, 'UPSTREAM_ERROR'],
    [200, { errcode: 9 }, 'UPSTREAM_ERROR'],
    [200, { upgrade_info: {} }, 'UPSTREAM_UPGRADE'],
    [503, {}, 'UPSTREAM_ERROR'],
    [429, {}, 'UPSTREAM_RATE_LIMIT'],
  ])('HTTP %s 映射为独立错误类型', async (status, body, code) => {
    await expect(
      weread(
        'fake',
        '/shelf/sync',
        {},
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json(body, { status: Number(status), headers: { 'Retry-After': '60' } }),
          ),
      ),
    ).rejects.toMatchObject({ code })
  })
  it('网络失败不宣称 Key 失效', async () => {
    await expect(
      weread(
        'fake',
        '/shelf/sync',
        {},
        vi.fn<typeof fetch>().mockRejectedValue(new Error('private diagnostic')),
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' })
  })
})
describe('本站 API 和导出边界', () => {
  it('匿名请求不能读取私人报告，响应不缓存', async () => {
    const response = await app.request('/api/session/reports', {}, {} as never)
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ code: 'ACCESS_REQUIRED' })
  })
  it('拒绝跨域写入及缺失来源的请求', async () => {
    for (const origin of [undefined, 'https://untrusted.example']) {
      const response = await app.request(
        '/api/archives',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
          body: '{}',
        },
        {} as never,
      )
      expect(response.status).toBe(403)
    }
  })
  it('公开示例无须数据库，非法周期不被接受', async () => {
    const result = await app.request('/api/demo?range=monthly')
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ meta: { sampleReport: true } })
    expect((await app.request('/api/demo?range=invalid')).status).toBe(400)
  })
  it('HTML 转义正文且离线报告嵌入 SVG，不包含远程脚本', async () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    )
    const report = createDemo('monthly', new Date('2026-10-03T00:00:00Z'))
    report.portrait.title = '<script>alert(1)</script>'
    const html = await makeHtml(report)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/<script|<link|<img/i)
    expect(exportData(report).notes).toHaveLength(0)
    expect(exportData(report, true).notes).toEqual(report.notes)
  })
})
