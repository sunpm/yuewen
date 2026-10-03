import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('独立 Vant 首页、书架搜索、详情和笔记筛选', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/m/')
  await expect(page.getByRole('button', { name: '开启我的阅读档案' })).toBeVisible()
  await page.getByRole('button', { name: '先翻翻示例' }).click()
  await expect(page.getByRole('heading', { name: '我的阅读档案', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '书架', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索书名或作者' }).fill('山野来信')
  await expect(page.locator('.mobile-book')).toHaveCount(1)
  await page.locator('.mobile-book').click()
  await expect(page.getByRole('dialog', { name: '书籍详情' })).toContainText('山野来信')
  await page.getByRole('button', { name: '关闭书籍详情' }).click()
  await expect(page.getByRole('dialog', { name: '书籍详情' })).toBeHidden()
  await page.locator('.mobile-book').click()
  await page.getByRole('button', { name: '翻看这本书的笔记' }).click()
  await expect(page).toHaveURL(/\/m\/demo\?view=notes&book=/)
  await page.reload()
  await expect(page.locator('.van-dropdown-menu')).toContainText('山野来信')
  await page.getByRole('tab', { name: '笔记', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索划线与想法' }).fill('没有这句话的原创测试')
  await expect(page.getByText('这里还没有留下文字')).toBeVisible()
  await page.getByRole('button', { name: '清除筛选' }).click()
  await expect(page.locator('.mobile-note').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('27 个移动端模块和独立章节切换', async ({ page }) => {
  await page.goto('/m/demo?view=report')
  for (const [name, count] of [
    ['时间', 9],
    ['偏好', 6],
    ['书架', 6],
    ['笔记', 6],
  ] as const) {
    await page.getByRole('tab', { name, exact: true }).first().click()
    await expect(page.locator('[data-module]:visible')).toHaveCount(count)
  }
  await page.getByRole('button', { name: '统计范围', exact: true }).click()
  await page.getByRole('button', { name: '本月', exact: true }).click()
  await expect(page.getByRole('button', { name: '统计范围' })).toHaveText(/本月/)
})

test('移动端 JSON 导出范围与笔记开关', async ({ page }) => {
  await page.goto('/m/demo')
  await page.getByRole('button', { name: '统计范围', exact: true }).click()
  await page.getByRole('button', { name: '本月', exact: true }).click()
  await page.getByRole('button', { name: '下载示例报告' }).click()
  await page.getByRole('switch', { name: '附上全部已读取笔记' }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 JSON', exact: true }).click()
  const file = await pending
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(data.meta.sampleReport).toBe(true)
  expect(data.range.key).toBe('monthly')
  expect(data.modules).toHaveLength(27)
  expect(data.notes.length).toBeGreaterThan(0)
})

test('移动端 HTML 在断网后可读', async ({ page, context }) => {
  await page.goto('/m/demo')
  await page.getByRole('button', { name: '下载示例报告' }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 HTML', exact: true }).click()
  const file = await pending
  const html = await readFile((await file.path())!, 'utf8')
  await context.setOffline(true)
  await page.setContent(html)
  await expect(page.getByRole('heading', { name: '划线精选' })).toBeVisible()
  expect(await page.locator('svg').count()).toBeGreaterThan(15)
  expect(await page.locator('script, link[href], img[src]').count()).toBe(0)
})

test('移动端登录路径与桌面端独立', async ({ page }) => {
  await page.goto('/m/overview')
  await expect(page).toHaveURL(/\/m\/login\?next=/)
  await expect(page.getByText('邮箱登录服务尚未配置。你可以先浏览完整示例。')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送验证码' })).toBeDisabled()
  await page.goto('/m/login?mode=reset')
  await expect(page.getByRole('heading', { name: '重新设置密码' })).toBeVisible()
})

test('手机宽度、底栏和明暗主题验证', async ({ page }, testInfo) => {
  for (const path of [
    '/m/',
    '/m/demo',
    '/m/demo?view=report',
    '/m/demo?view=shelf',
    '/m/demo?view=notes',
    '/m/login',
  ]) {
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      const sizes = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }))
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.viewport + 1)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/m/')
  await page.screenshot({ path: testInfo.outputPath('mobile-home.png'), fullPage: true })
  await page.goto('/m/demo')
  await expect(page.locator('.report-chart svg')).toBeVisible()
  await expect(page.getByRole('tab', { name: '档案', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobile-overview.png'), fullPage: true })
  await page.screenshot({ path: testInfo.outputPath('mobile-overview-viewport.png'), scale: 'css' })
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: testInfo.outputPath('mobile-overview-dark.png'), fullPage: true })
  await page.screenshot({
    path: testInfo.outputPath('mobile-overview-dark-viewport.png'),
    scale: 'css',
  })
})
