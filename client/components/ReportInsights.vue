<script setup lang="ts">
import type { Insights } from '@shared/insights'
defineProps<{ insights: Insights }>()
const number = (value: number | null) =>
  value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
</script>
<template>
  <section class="report-insights" aria-label="扩展阅读指标">
    <h2>阅读节律与变化</h2>
    <p>{{ insights.scope }}</p>
    <div class="insight-grid">
      <article v-for="metric in insights.metrics" :key="metric.label">
        <h3>{{ metric.label }}</h3>
        <strong>
          {{ number(metric.value) }}
          <small>{{ metric.unit }}</small>
        </strong>
        <p>{{ metric.reason }}</p>
        <small v-if="metric.numerator != null && metric.denominator != null">
          {{ number(metric.numerator) }} ÷ {{ number(metric.denominator)
          }}{{ metric.unit === '%' ? ' × 100%' : '' }}
        </small>
      </article>
    </div>
    <details>
      <summary>日内阅读时段</summary>
      <p>{{ insights.hourly.scope }} · {{ insights.hourly.reason }}</p>
      <dl class="hour-grid">
        <div v-for="hour in insights.hourly.data" :key="hour.label">
          <dt>{{ hour.label }}</dt>
          <dd>{{ number(hour.value) }} 小时</dd>
        </div>
      </dl>
    </details>
    <details>
      <summary>月度环比</summary>
      <p>{{ insights.comparison.reason }}</p>
      <p v-for="period in insights.comparison.periods" :key="period.start">
        {{ period.label }}：{{ period.start }} — {{ period.end }}
      </p>
      <dl>
        <div v-for="metric in insights.comparison.metrics" :key="metric.label">
          <dt>{{ metric.label }}：{{ number(metric.value) }} {{ metric.unit }}</dt>
          <dd>{{ metric.reason }}</dd>
        </div>
      </dl>
    </details>
    <details>
      <summary>单书已采集笔记密度</summary>
      <p>已采集笔记／阅读小时 · {{ insights.scope }}。仅描述已采集内容，不代表阅读质量。</p>
      <article v-for="book in insights.density" :key="book.bookId" class="density-row">
        <h3>{{ book.title }}</h3>
        <p>{{ number(book.value) }} 条／阅读小时 · {{ book.partial ? '部分覆盖' : '已读取' }}</p>
        <small>
          {{ book.reason }} 分子 {{ book.count }} 条；时长
          {{ book.seconds == null ? '未知' : `${number(book.seconds / 3600)} 小时` }}。
        </small>
      </article>
    </details>
  </section>
</template>
<style scoped>
.report-insights {
  margin: 28px 0;
  padding: 20px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 16px;
  overflow-wrap: anywhere;
}
.report-insights h2 {
  font-size: 24px;
  margin: 0 0 8px;
}
.report-insights h3 {
  font-size: 16px;
  margin: 0 0 8px;
}
.report-insights p {
  font-size: 14px;
  margin: 8px 0;
}
.insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  gap: 20px;
  margin: 20px 0;
}
.insight-grid strong {
  font-size: 26px;
  font-weight: 500;
}
.insight-grid strong small {
  font-size: 14px;
}
.report-insights summary {
  cursor: pointer;
  min-height: 44px;
  align-content: center;
}
.report-insights dd {
  margin: 0;
  font-size: 14px;
}
.hour-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 12px;
}
.density-row {
  padding: 12px 0;
  border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
}
</style>
