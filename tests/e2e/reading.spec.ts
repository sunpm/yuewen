import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
test('示例书架筛选、详情、笔记和主题', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('link', { name: '开启我的阅读档案' })).toBeVisible()
  await page.getByRole('link', { name: '先翻翻示例' }).click()
  await expect(page.getByRole('heading', { name: '把日常，读成自己的风景。' })).toBeVisible()
  await page.getByRole('link', { name: '我的书架', exact: true }).click()
  await page.getByLabel('搜索书名或作者').fill('山野来信')
  await expect(page.locator('.book-item')).toHaveCount(1)
  await page.locator('.book-item').click()
  await expect(page.getByRole('dialog')).toContainText('山野来信')
  await page.getByRole('button', { name: '关闭书籍详情' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.book-item').click()
  await page.getByRole('button', { name: '翻看这本书的笔记' }).click()
  await expect(page).toHaveURL(/book=/)
  const selectedBook = await page.getByLabel('笔记来源书籍').inputValue()
  expect(selectedBook).not.toBe('全部')
  await page.reload()
  await expect(page.getByLabel('笔记来源书籍')).toHaveValue(selectedBook)
  await page.getByRole('link', { name: '划线与想法', exact: true }).click()
  await page.getByLabel('搜索划线与想法').fill('不可能出现的示例文字')
  await expect(page.getByRole('heading', { name: '这里还没有留下文字' })).toBeVisible()
  await page.getByRole('button', { name: '清除筛选' }).click()
  await expect(page.locator('.note-card').first()).toBeVisible()
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: '切换浅色主题' })).toBeVisible()
  expect(errors).toEqual([])
})
test('27 个报告模块、周期变化和 JSON 下载', async ({ page }) => {
  await page.goto('/demo?view=report')
  let modules = 0
  for (const name of ['时间', '偏好', '书架', '笔记']) {
    await page
      .getByRole('group', { name: '报告章节' })
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .click()
    modules += await page.locator('[data-module]').count()
  }
  expect(modules).toBe(27)
  await page.getByLabel('统计范围').selectOption('monthly')
  await page.getByRole('button', { name: '下载示例报告' }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 JSON', exact: true }).click()
  const download = await pending
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(data.meta.sampleReport).toBe(true)
  expect(data.range.key).toBe('monthly')
  expect(data.modules).toHaveLength(27)
  expect(data.notes).toHaveLength(0)
})
test('首页与报告没有横向溢出，主按钮文字有对比', async ({ page }, testInfo) => {
  for (const path of [
    '/',
    '/demo',
    '/demo?view=report',
    '/demo?view=shelf',
    '/demo?view=notes',
    '/login',
  ]) {
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }))
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.viewport + 1)
  }
  await page.goto('/')
  const button = page.getByRole('link', { name: '开启我的阅读档案' })
  const colors = await button.evaluate((el) => ({
    color: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundColor,
  }))
  expect(colors.color).not.toBe(colors.background)
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true })
  await page.goto('/demo')
  await expect(page.locator('.report-chart svg')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true })
})
test('未登录时转到登录页，未配置邮件时明确说明', async ({ page }) => {
  await page.goto('/overview')
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(page.getByText('邮箱登录服务尚未配置。你可以先浏览完整示例。')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送验证码' })).toBeDisabled()
})

test('HTML 下载可以离线打开，正文与图表仍可读', async ({ page, context }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: '下载示例报告' }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 HTML', exact: true }).click()
  const file = await pending
  const html = await readFile((await file.path())!, 'utf8')
  await context.setOffline(true)
  await page.setContent(html)
  await expect(page.getByRole('heading', { name: '把日常，读成自己的风景。' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '划线精选' })).toBeVisible()
  expect(await page.locator('svg').count()).toBeGreaterThan(15)
  expect(await page.locator('script, link[href], img[src]').count()).toBe(0)
})

test('桌面目标宽度和深色报告没有横向溢出', async ({ page }, testInfo) => {
  await page.goto('/demo?view=report')
  for (const width of [1920, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('h1')).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }))
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1)
  }
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.locator('.report-chart svg').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('report-desktop-dark.png'), fullPage: true })
})
