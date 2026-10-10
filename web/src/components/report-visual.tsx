import { calendarLayout, chartOption, loadCharts } from '@client/charts'
import { loadReadingFonts, readingFont } from '@client/fonts'
import type { layoutWords } from '@client/wordCloud'
import type { ReportModule } from '@shared/report'
import type { EChartsType } from 'echarts/core'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function ReportChart({
  module,
  onSelect,
}: {
  module: ReportModule
  onSelect?: (label: string) => void
}) {
  const viewport = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const select = useRef(onSelect)
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    select.current = onSelect
  }, [onSelect])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry must recreate a failed chart.
  useEffect(() => {
    const element = host.current
    const container = viewport.current
    if (!element || !container) return
    let active = true
    let chart: EChartsType | undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    setError(false)
    setReady(false)
    function draw() {
      if (!active || !chart || !element || !container) return
      try {
        const calendar =
          module.kind === 'heatmap' ? calendarLayout(module, container.clientWidth) : null
        element.style.width = calendar ? `${calendar.width}px` : '100%'
        element.style.height = calendar ? `${calendar.height}px` : '320px'
        chart.resize()
        chart.setOption(
          {
            ...chartOption(module, document.documentElement.classList.contains('dark'), {
              width: chart.getWidth(),
              height: chart.getHeight(),
            }),
            aria: {
              enabled: true,
              label: {
                description: `${module.title}，${module.scope}，单位${module.unit}。完整数据与统计口径见下方明细。`,
              },
            },
            animation: !reduced.matches,
          },
          true,
        )
        setReady(true)
      } catch {
        chart.dispose()
        chart = undefined
        setError(true)
      }
    }
    const size = new ResizeObserver(draw)
    size.observe(container)
    const theme = new MutationObserver(draw)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    reduced.addEventListener('change', draw)
    void loadCharts()
      .then((core) => {
        if (!active) return
        chart = core.init(element, undefined, { renderer: 'svg' })
        chart.on('click', (event) => {
          if (event.name) select.current?.(event.name)
        })
        const showRadar = (event: { offsetX: number; offsetY: number }) => {
          if (module.kind === 'radar')
            chart?.dispatchAction({
              type: 'showTip',
              seriesIndex: 0,
              dataIndex: 0,
              position: [event.offsetX, event.offsetY],
            })
        }
        chart.getZr().on('mousemove', showRadar).on('click', showRadar)
        draw()
        void loadReadingFonts()
          .then(draw)
          .catch(() => {
            /* System font remains readable. */
          })
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
      size.disconnect()
      theme.disconnect()
      reduced.removeEventListener('change', draw)
      chart?.dispose()
    }
  }, [module, attempt])
  const calendar = module.kind === 'heatmap' ? calendarLayout(module, 0) : null
  return (
    <div data-visual-pending={(!ready && !error) || undefined}>
      {error ? (
        <p role="alert" className="scope-note">
          图表暂时无法绘制，完整数据仍可在下方明细查看。
          <Button variant="ghost" onClick={() => setAttempt(attempt + 1)}>
            重试图表
          </Button>
        </p>
      ) : !ready ? (
        <p role="status" className="scope-note">
          正在绘制图表…
        </p>
      ) : null}
      {calendar && <p className="scope-note">每格一天；窄窗口可横向滚动查看全年。</p>}
      <section
        ref={viewport}
        className="chart-viewport"
        aria-label={`${module.title}图表区域`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable calendars need keyboard access.
        tabIndex={0}
      >
        <div
          ref={host}
          className="report-chart"
          role="img"
          aria-label={`${module.title}，单位${module.unit}；完整数据见下方明细`}
          style={{ height: calendar?.height ?? 320, minWidth: calendar ? 720 : undefined }}
        />
      </section>
    </div>
  )
}

export function WordCloud({ module }: { module: ReportModule }) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutWords>>>()
  const [selected, setSelected] = useState('')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const element = host.current
    if (!element) return
    const measure = () => setWidth(Math.max(256, Math.floor(element.clientWidth / 32) * 32))
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry reruns a failed import or layout.
  useEffect(() => {
    const controller = new AbortController()
    setLayout(undefined)
    setSelected('')
    setError(false)
    if (width)
      void import('@client/wordCloud')
        .then(({ layoutWords }) => layoutWords(module.data, width, controller.signal))
        .then((result) => {
          if (!controller.signal.aborted) setLayout(result)
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true)
        })
    return () => controller.abort()
  }, [module.data, width, attempt])
  return (
    <div ref={host} className="word-cloud" data-visual-pending={(!layout && !error) || undefined}>
      {layout ? (
        // biome-ignore lint/a11y/useSemanticElements: SVG groups cannot be replaced by HTML fieldsets.
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ fontFamily: readingFont }}
          role="group"
          aria-label={`${module.title}，点按词语查看频次`}
        >
          <title>{module.title}</title>
          <g transform={`translate(${layout.width / 2},${layout.height / 2})`} textAnchor="middle">
            {layout.words.map((word, index) => {
              const description = `${word.label}：${word.value} ${module.unit}`
              return (
                // biome-ignore lint/a11y/useSemanticElements: Positioned SVG text uses button semantics with Enter and Space support.
                <text
                  key={word.label}
                  x={word.x}
                  y={word.y}
                  fontSize={word.size}
                  className={`word-tone-${index % 3}`}
                  tabIndex={0}
                  role="button"
                  aria-label={description}
                  onMouseEnter={() => setSelected(description)}
                  onFocus={() => setSelected(description)}
                  onClick={() => setSelected(description)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelected(description)
                    }
                  }}
                >
                  <title>{description}</title>
                  {word.text}
                </text>
              )
            })}
          </g>
        </svg>
      ) : error ? (
        <p role="alert">
          词云暂时无法绘制，完整词频见下方明细。
          <Button variant="ghost" onClick={() => setAttempt(attempt + 1)}>
            重试词云
          </Button>
        </p>
      ) : (
        <p role="status">正在排布词云…</p>
      )}
      {layout && (
        <>
          <p className="word-tooltip" aria-live="polite">
            {selected || '点按词语查看频次'}
          </p>
          {layout.words.length < module.data.length && (
            <p className="scope-note">
              云图展示 {layout.words.length} / {module.data.length} 个词，完整词频见下方明细。
            </p>
          )}
          {layout.words.some((word) => word.text !== word.label) && (
            <p className="scope-note">长词已省略显示，点按或打开明细查看完整词语。</p>
          )}
        </>
      )}
    </div>
  )
}
