import { embeddedFonts, loadReadingFonts, readingFont } from './fonts'
import type { ReadingReport } from '@shared/report'
import { duration, noteLocation, periodCells } from '@shared/report'
import { calendarLayout, chartOption, loadCharts } from './charts'
export const escapeHtml = (text: unknown): string =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function exportData(report: ReadingReport, details = false) {
  // The explicit report contract contains no task, account, credential or session fields.
  return {
    meta: report.meta,
    range: report.range,
    summary: report.summary,
    modules: report.modules,
    books: report.books,
    notes: details ? report.notes : [],
    portrait: report.portrait,
    coverage: report.coverage,
    issues: report.issues,
  }
}
export async function makeHtml(report: ReadingReport, details = false): Promise<string> {
  await loadReadingFonts()
  const [core, fonts] = await Promise.all([loadCharts(), embeddedFonts()])
  const e = escapeHtml
  const sourceLabel = report.meta.sampleReport
    ? '模拟示例'
    : report.meta.source === 'development'
      ? '本地开发数据'
      : '我的阅读档案'
  const modules = report.modules
    .map((module) => {
      let svg = ''
      if (module.data.length && !['table', 'words'].includes(module.kind)) {
        const size =
          module.kind === 'heatmap' ? calendarLayout(module, 760) : { width: 760, height: 340 }
        const chart = core.init(null, undefined, {
          renderer: 'svg',
          ssr: true,
          width: size.width,
          height: size.height,
        })
        chart.setOption({
          ...chartOption(module, false, { width: chart.getWidth(), height: chart.getHeight() }),
          animation: false,
          tooltip: { show: false },
        })
        svg = chart.renderToSVGString()
        if (module.kind === 'heatmap')
          svg = `<div style="overflow-x:auto"><div style="min-width:720px">${svg}</div></div>`
        chart.dispose()
      }
      const table = module.periods?.length
        ? `<table><thead><tr>${['时间', '阅读时长', '阅读天数', '读过', '读完', '笔记'].map((label) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${module.periods
            .map(
              (p) =>
                `<tr><th>${e(p.label)}<small>${e(p.start)} — ${e(p.end)}</small></th>${periodCells(
                  p,
                )
                  .map((value) => `<td>${e(value)}</td>`)
                  .join('')}</tr>`,
            )
            .join(
              '',
            )}</tbody></table><h3>统计原文</h3>${module.periods.map((p) => `<p>${e(p.label)}：${e(p.stats.map((stat) => `${stat.name} ${stat.text}`).join('；'))}</p>`).join('')}`
        : `<table><tbody>${module.data.map((d) => `<tr><th>${e(d.label)}</th><td>${module.unit === '日期' ? '最近活动' : `${e(d.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }))} ${e(d.unit ?? module.unit)}`}${d.secondary != null ? ` / 进度 ${e(d.secondary)}%` : ''}</td></tr>`).join('')}</tbody></table>`
      return `<section><h2>${module.id}. ${e(module.title)}</h2><p>${e(module.description)}</p><p>${e(module.scope)} · ${module.coverage.complete ? '已齐全' : '部分或不可用'} · ${e(module.coverage.loaded)} / ${e(module.coverage.expected ?? '未知')}</p>${module.coverage.reason ? `<p>${e(module.coverage.reason)}</p>` : ''}${svg}${table}</section>`
    })
    .join('')
  const notes = details ? report.notes : report.portrait.selections
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>阅纹 · ${report.meta.sampleReport ? '示例' : '个人'}阅读报告</title><style>${fonts.css}body{margin:0;background:#F5EFE3;color:#4F5B2A;font:16px/1.8 ${readingFont}}main{max-width:960px;margin:auto;padding:50px 24px}h1,h2,blockquote{font-family:${readingFont}}h1{font-size:40px}section{border-top:1px solid #D8C9A8;padding:28px 0;break-inside:avoid}svg{width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:6px;text-align:left;border-bottom:1px solid #D8C9A8}blockquote{margin:20px 0;padding:16px;border-left:3px solid #B8892D;white-space:pre-wrap}small{display:block}p{overflow-wrap:anywhere}@media print{body{background:white}main{padding:0}details{display:block}}</style><main><p>阅纹 · 看见你的阅读轨迹 · ${e(sourceLabel)}</p><h1>${e(report.portrait.title)}</h1><p>${e(report.range.start)} — ${e(report.range.end)} · Asia/Shanghai</p><p>${e(duration(report.summary.seconds))} · ${report.summary.readDays ?? '未知'} 个阅读日</p><p>${e(report.portrait.text)}</p><p>采集覆盖：${e(report.coverage.loaded)} / ${e(report.coverage.expected ?? '未知')}；${report.coverage.complete ? '完整' : '部分'}。</p>${report.issues.map((i) => `<p>${e(i)}</p>`).join('')}${modules}<section><h2>${details ? '已读取的划线与想法' : '划线精选'}</h2>${notes.map((n) => `<blockquote>${n.demoText ? '<small>演示文本 · 非书中原文</small>' : ''}${e(n.text)}<small>${e(n.title)} · ${e(noteLocation(n))} · ${e(n.date)} · ${n.type === 'thought' ? '个人想法' : '划线'}</small></blockquote>`).join('')}</section><p>报告采集时间：${e(new Date(report.meta.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}</p><p>由阅纹生成，数据与范围说明已嵌入。此文件可离线阅读。</p><details><summary>字体版权与许可</summary><pre style="white-space:pre-wrap">${e(fonts.license)}</pre></details></main></html>`
}
export function download(content: string, type: 'html' | 'json', sample: boolean) {
  const blob = new Blob([content], {
    type: type === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = `阅纹-${sample ? '示例' : '阅读'}报告.${type}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
