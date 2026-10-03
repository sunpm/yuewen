<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import type { ReportModule } from '@shared/report'
import type { EChartsType } from 'echarts/core'
import { calendarLayout, chartOption, loadCharts } from '@client/charts'
import { loadReadingFonts } from '@client/fonts'
import { useTheme } from '@client/useTheme'
const props = defineProps<{ module: ReportModule }>()
const emit = defineEmits<{ select: [label: string] }>()
const host = ref<HTMLElement>()
const viewport = ref<HTMLElement>()
const width = ref(0)
const calendar = computed(() =>
  props.module.kind === 'heatmap' ? calendarLayout(props.module, width.value) : undefined,
)
const { dark } = useTheme()
let chart: EChartsType | undefined,
  observer: ResizeObserver | undefined,
  disposed = false
function updateChart() {
  if (!chart) return
  chart.resize()
  chart.setOption(
    {
      ...chartOption(props.module, dark.value, {
        width: chart.getWidth(),
        height: chart.getHeight(),
      }),
      animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
    true,
  )
}
onMounted(async () => {
  width.value = viewport.value?.clientWidth ?? 0
  const core = await loadCharts()
  if (disposed || !host.value) return
  chart = core.init(host.value, undefined, { renderer: 'svg' })
  updateChart()
  void loadReadingFonts()
    .then(() => {
      if (!disposed) updateChart()
    })
    .catch(() => {
      /* System fallback remains readable. */
    })
  chart.on('click', (p) => {
    if (p.name) emit('select', p.name)
  })
  observer = new ResizeObserver(() => {
    width.value = viewport.value?.clientWidth ?? 0
  })
  observer.observe(viewport.value!)
})
watch(() => [props.module, dark.value, width.value], updateChart, { flush: 'post' })
onUnmounted(() => {
  disposed = true
  observer?.disconnect()
  chart?.dispose()
})
</script>
<template>
  <p v-if="calendar && calendar.width > width" class="calendar-hint">左右滑动查看全年</p>
  <div
    ref="viewport"
    :class="{ 'calendar-chart': calendar }"
    :tabindex="calendar ? 0 : undefined"
    :role="calendar ? 'region' : undefined"
    :aria-label="calendar ? '全年阅读日历，可横向滚动查看完整年份' : undefined"
  >
    <div
      ref="host"
      class="report-chart"
      :style="
        calendar ? { width: `${calendar.width}px`, height: `${calendar.height}px` } : undefined
      "
      role="img"
      :aria-label="`${module.title}，单位${module.unit}，可在查看更多中查看数据表`"
    ></div>
  </div>
</template>
<style scoped>
.calendar-hint {
  margin: 8px 0 0;
  font-size: 11px;
  opacity: 0.7;
}
.calendar-chart {
  max-width: 100%;
  overflow-x: auto;
}
</style>
