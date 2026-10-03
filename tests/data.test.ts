import { describe, expect, it } from 'vitest'
import { createDemo } from '../shared/demo'
import { getRange, longestStreak, naturalDays, shanghaiDate } from '../shared/report'
import { advanceCollector, buildReport, newCollector, normalizeShelf } from '../server/collector'
import { AppError } from '../server/weread'
import type { JsonObject } from '../server/weread'
const now = new Date('2026-10-03T12:00:00Z')
describe('周期与统计口径', () => {
  it('上海跨日、跨年与 24 个自然月边界', () => {
    expect(shanghaiDate(new Date('2025-12-31T16:00:00Z'))).toBe('2026-01-01')
    expect(getRange('recent', now)).toMatchObject({ start: '2024-11-01', end: '2026-10-03' })
    expect(getRange('weekly', now).start).toBe('2026-09-28')
    expect(naturalDays(getRange('2024', now))).toBe(366)
  })
  it('连续阅读按 60 秒阈值及相邻自然日判断', () => {
    expect(
      longestStreak([
        { label: '2026-01-01', value: 60 },
        { label: '2026-01-02', value: 59 },
        { label: '2026-01-03', value: 60 },
        { label: '2026-01-04', value: 90 },
        { label: '2026-01-07', value: 90 },
      ]),
    ).toBe(2)
  })
  it('电子书、有声内容和文章收藏入口均计入书架，进度 1 保留为 1%', () => {
    const shelf = normalizeShelf(
      {
        books: [{ bookId: 'a', title: '书', secret: 0 }],
        albums: [
          { albumInfo: { albumId: 'b', name: '音频', finish: 1 }, albumInfoExtra: { secret: 1 } },
        ],
        mp: { show: 1 },
      },
      [{ bookId: 'a', readingProgress: 1, noteCount: 2, reviewCount: 3, bookmarkCount: 1 }],
    )
    expect(shelf).toHaveLength(3)
    expect(shelf[0]).toMatchObject({ progress: 1, noteCount: 6 })
    expect(shelf[1].finished).toBeUndefined()
    expect(shelf[2].secret).toBe(true)
  })
  it('未取得统计是未知，明确返回零则保留零', () => {
    const state = newCollector('monthly', now)
    expect(buildReport(state).summary.seconds).toBeNull()
    state.queue = []
    state.results['period:monthly'] = { totalReadTime: 0, readDays: 0 }
    const report = buildReport(state)
    expect(report.summary.seconds).toBe(0)
    expect(report.summary.readDays).toBe(0)
    expect(report.modules[14].status).toBe('unavailable')
  })
  it('主总量使用官方汇总，不以不完整日明细替换', () => {
    const state = newCollector('monthly', now)
    state.queue = []
    state.results['period:monthly'] = {
      totalReadTime: 7200,
      readDays: 2,
      readTimes: { '1790956800': 60 },
    }
    expect(buildReport(state).summary.seconds).toBe(7200)
    expect(buildReport(state).modules[1].data[0].value).toBe(2)
  })
  it('示例具备独立 27 模块、原创标识和最多 20 条精选', () => {
    const report = createDemo('recent', now)
    expect(report.modules.map((m) => m.id)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1))
    expect(report.meta.sampleReport).toBe(true)
    expect(report.portrait.selections.length).toBeLessThanOrEqual(20)
    expect(report.modules[1].data).toHaveLength(24)
    expect(
      report.notes.every((n) => n.date! >= report.range.start && n.date! <= report.range.end),
    ).toBe(true)
    expect(report.modules[15].data.reduce((n, d) => n + d.value, 0)).toBe(report.books.length)
  })
})
describe('采集分页与部分失败', () => {
  it('笔记游标不前进时停下，保留已成功取得的数据', async () => {
    const state = newCollector('monthly', now)
    state.queue = [{ id: 'notebooks', api: '/user/notebooks', params: { lastSort: 4 } }]
    await advanceCollector(state, 'fake', async () => ({
      books: [{ bookId: 'a', sort: 4, noteCount: 0, reviewCount: 0 }],
      hasMore: 1,
    }))
    expect(state.notebookBooks).toHaveLength(1)
    expect(state.failed).toHaveLength(1)
    expect(state.queue).toHaveLength(0)
  })
  it('后续分页的业务参数平铺并使用正确的 lastSort', async () => {
    const state = newCollector('monthly', now)
    state.queue = [{ id: 'notebooks', api: '/user/notebooks', params: { count: 100 } }]
    await advanceCollector(state, 'fake', async () => ({
      books: [{ bookId: 'a', sort: 42, noteCount: 1 }],
      hasMore: 1,
    }))
    expect(state.queue[0]).toMatchObject({ params: { count: 100, lastSort: 42 } })
    expect(state.queue[1].api).toBe('/book/bookmarklist')
  })
  it('单书失败不丢弃已有笔记，成功分页按稳定 ID 去重', async () => {
    const state = newCollector('monthly', now)
    state.notebookBooks = [{ bookId: 'a', book: { title: '原创书' } }]
    const op = { id: 'highlights:a', api: '/book/bookmarklist' as const, params: { bookId: 'a' } }
    const result: JsonObject = {
      updated: [{ bookmarkId: 'h1', type: 1, markText: '原创文字', createTime: 1790956800 }],
    }
    state.queue = [op, op]
    await advanceCollector(state, 'fake', async () => result)
    await advanceCollector(state, 'fake', async () => result)
    expect(state.notes).toHaveLength(1)
    state.queue = [op]
    await advanceCollector(state, 'fake', async () => {
      throw new AppError('UPSTREAM_ERROR', '失败')
    })
    expect(state.notes[0].text).toBe('原创文字')
    expect(state.failed).toHaveLength(1)
  })
  it('升级提示阻止后续采集，原队列仍可恢复', async () => {
    const state = newCollector('monthly', now)
    await expect(
      advanceCollector(state, 'fake', async () => {
        throw new AppError('UPSTREAM_UPGRADE', '升级')
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UPGRADE' })
    expect(state.failed[0].api).toBe('/shelf/sync')
    expect(state.queue.length).toBeGreaterThan(0)
  })
})
