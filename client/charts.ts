import { readingFont } from './fonts'
import type { EChartsOption } from 'echarts'
import type { ReportModule } from '@shared/report'

export function calendarLayout(module: ReportModule, availableWidth: number) {
  const dates = [
    ...module.data.map((d) => d.label),
    ...(module.scope.match(/\d{4}-\d{2}-\d{2}/g) ?? []),
  ].sort()
  const firstYear = Number(dates[0]?.slice(0, 4))
  const lastYear = Number(dates.at(-1)?.slice(0, 4))
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => String(firstYear + i))
  const width = Math.max(720, availableWidth)
  // A leap year starting on Sunday can occupy 54 Monday-first calendar columns.
  const cellSize = Math.floor((width - 64) / 54)
  const rowHeight = cellSize * 7 + 72
  return { years, width, cellSize, rowHeight, height: years.length * rowHeight + 24 }
}

export function chartOption(
  module: ReportModule,
  dark: boolean,
  { width }: { width: number; height: number },
): EChartsOption {
  const ink = dark ? '#a9adae' : '#4F5B2A',
    line = dark ? '#383b3d' : '#ded5c0'
  const palette = dark
    ? ['#B8C58A', '#C4AA73', '#879B7D', '#B7B09B']
    : ['#4F5B2A', '#B8892D', '#8c976a', '#D8C9A8']
  const tooltip = {
    confine: true,
    triggerOn: 'mousemove|click|mousewheel' as const,
    renderMode: 'richText' as const,
    backgroundColor: dark ? '#272a2d' : '#FAF6ED',
    borderColor: line,
    textStyle: { color: dark ? '#E4E7DA' : ink, fontFamily: readingFont },
    valueFormatter: (value: unknown) =>
      `${typeof value === 'number' ? value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : value} ${module.unit}`,
  }
  const data =
    module.kind === 'bar' && module.data.length > 12 && !/^\d{4}/.test(module.data[0]?.label ?? '')
      ? [...module.data].sort((a, b) => b.value - a.value).slice(0, 12)
      : module.data
  const base: EChartsOption = {
    animationDuration: 250,
    textStyle: { color: ink, fontFamily: readingFont },
    color: palette,
    aria: { enabled: true },
    tooltip: { ...tooltip, trigger: 'item' },
    grid: {
      left: 16,
      right: 20,
      top: 24,
      bottom: 24,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
  }
  const values = data.map((d) => ({ name: d.label, value: Math.round(d.value * 10) / 10 }))
  if (module.kind === 'donut')
    return {
      ...base,
      legend: { bottom: 0, textStyle: { color: ink } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '70%'],
          center: ['50%', '43%'],
          label: { show: false },
          data: values,
        },
      ],
    }
  if (module.kind === 'radar')
    return {
      ...base,
      tooltip: {
        ...tooltip,
        formatter: () =>
          data
            .map(
              (d) =>
                `${d.label}：${d.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${module.unit}`,
            )
            .join('\n'),
      },
      radar: {
        indicator: data.map((d) => ({
          name: d.label,
          max: Math.max(100, ...data.map((x) => x.value)),
        })),
        splitLine: { lineStyle: { color: line } },
        axisName: { color: ink },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: line } },
        radius: '60%',
      },
      series: [
        {
          type: 'radar',
          name: module.title,
          data: [{ name: module.title, value: values.map((d) => d.value) }],
          areaStyle: { opacity: 0.2 },
        },
      ],
    }
  if (module.kind === 'treemap')
    return {
      ...base,
      series: [
        {
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          data: values,
          label: { formatter: '{b}\n{c} 小时', color: dark ? '#111213' : '#FAF6ED' },
          itemStyle: { borderWidth: 3, borderColor: dark ? '#1c1e20' : '#f5efe3' },
        },
      ],
    }
  if (module.kind === 'scatter')
    return {
      ...base,
      tooltip: {
        ...tooltip,
        formatter: (params) => {
          const point = Array.isArray(params) ? params[0] : params
          const values = point.value as number[]
          return `${point.name}\n阅读进度 ${values[0]}%\n累计笔记 ${values[1]} 条`
        },
      },
      xAxis: {
        type: 'value',
        max: 100,
        name: '进度 %',
        nameLocation: 'middle',
        nameGap: 25,
        nameTextStyle: { color: ink },
        axisLabel: { color: ink },
        splitLine: { lineStyle: { color: line } },
      },
      yAxis: {
        type: 'value',
        name: module.unit,
        axisLabel: { color: ink },
        splitLine: { lineStyle: { color: line } },
      },
      series: [
        {
          type: 'scatter',
          symbolSize: 14,
          data: data.map((d) => ({ name: d.label, value: [d.secondary ?? 0, d.value] })),
        },
      ],
    }
  if (module.kind === 'heatmap') {
    const { years, cellSize, rowHeight } = calendarLayout(module, width)
    const readings = new Map(data.map((d) => [d.label, d.value]))
    const emptyColor = dark ? '#272a2d' : '#eee7d7'
    const borderColor = dark ? '#1c1e20' : '#FAF6ED'
    const colors = dark
      ? ['#536344', '#728459', '#95AA70', '#B8C58A']
      : ['#bbc8a0', '#93a66b', '#6e8347', '#4F5B2A']
    return {
      ...base,
      grid: undefined,
      aria: {
        enabled: true,
        label: {
          description: `${module.title}，${module.scope}。每格代表一天，有阅读的日期按时长高亮；浅色为未阅读或当前报告未包含数据的日期。完整日明细见下方数据表。`,
        },
      },
      title: years.map((year, index) => ({
        text: `${year} 年`,
        left: 40,
        top: index * rowHeight + 8,
        textStyle: { color: ink, fontSize: 14, fontWeight: 500 },
      })),
      calendar: years.map((year, index) => ({
        range: year,
        left: 44,
        top: index * rowHeight + 56,
        cellSize: [cellSize, cellSize],
        orient: 'horizontal',
        splitLine: { show: false },
        itemStyle: { color: emptyColor, borderColor, borderWidth: 2 },
        yearLabel: { show: false },
        monthLabel: { color: ink, fontSize: 11, margin: 10, formatter: '{M}月' },
        dayLabel: {
          firstDay: 1,
          nameMap: ['日', '一', '二', '三', '四', '五', '六'],
          color: ink,
          fontSize: 10,
          margin: 10,
        },
      })),
      tooltip: {
        ...tooltip,
        confine: true,
        formatter: (params) => {
          const point = Array.isArray(params) ? params[0] : params
          const minutes = readings.get(point.name)
          return `${point.name}\n${
            minutes == null
              ? '当前报告未包含这天的数据'
              : minutes === 0
                ? '未阅读'
                : `阅读 ${minutes < 1 ? '不足 1' : minutes.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 分钟`
          }`
        },
      },
      visualMap: {
        type: 'piecewise',
        dimension: 1,
        orient: 'horizontal',
        right: 20,
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 6,
        text: ['多', '少'],
        textStyle: { color: ink },
        showLabel: false,
        selectedMode: false,
        pieces: [
          { lte: 0, color: emptyColor },
          { gt: 0, lte: 30, color: colors[0] },
          { gt: 30, lte: 60, color: colors[1] },
          { gt: 60, lte: 120, color: colors[2] },
          { gt: 120, color: colors[3] },
        ],
      },
      series: years.map((year, calendarIndex) => {
        const days = []
        const end = Date.UTC(Number(year) + 1, 0, 1)
        for (let stamp = Date.UTC(Number(year), 0, 1); stamp < end; stamp += 86400000) {
          const date = new Date(stamp).toISOString().slice(0, 10)
          days.push({ name: date, value: [date, readings.get(date) ?? -1] })
        }
        return {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          calendarIndex,
          data: days,
          itemStyle: { borderColor, borderWidth: 2 },
        }
      }),
    }
  }
  const horizontal =
    !['line'].includes(module.kind) && data.length > 0 && !/^\d{4}/.test(data[0].label)
  const category = {
    type: 'category' as const,
    data: data.map((d) => d.label),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: ink, width: 112, overflow: 'truncate' as const, fontSize: 11 },
  }
  const numeric = {
    type: 'value' as const,
    name: module.unit,
    nameTextStyle: { color: ink },
    splitLine: { lineStyle: { color: line, type: 'dashed' as const } },
    axisLabel: { color: ink, fontSize: 10 },
  }
  return {
    ...base,
    tooltip: { ...tooltip, trigger: 'axis', confine: true },
    grid: { ...base.grid, bottom: horizontal ? 52 : 24 },
    xAxis: horizontal ? { ...numeric, nameLocation: 'middle', nameGap: 28 } : category,
    yAxis: horizontal ? { ...category, inverse: true } : numeric,
    series: [
      {
        type: module.kind === 'line' ? 'line' : 'bar',
        data: values,
        barMaxWidth: 28,
        smooth: 0.25,
        symbol: 'none',
        areaStyle: module.kind === 'line' ? { opacity: 0.08 } : undefined,
        itemStyle: { borderRadius: 3 },
      },
    ],
  }
}
export const loadCharts = () => import('./echarts')
