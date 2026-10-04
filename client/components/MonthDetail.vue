<script setup lang="ts">
import { computed } from 'vue'
import type { ReadingReport } from '@shared/report'
import { duration } from '@shared/report'
const props = defineProps<{ report: ReadingReport; month: string }>()
const detail = computed(() => props.report.insights?.months?.find((m) => m.month === props.month))
</script>
<template>
  <section class="month-detail" :aria-label="`${month} 月份明细`">
    <h3>{{ month }} · 阅读与笔记</h3>
    <template v-if="detail">
      <p>
        {{ detail.period.start }} — {{ detail.period.end }} ·
        {{ duration(detail.period.seconds) }} · {{ detail.period.readDays ?? '未知' }} 个有效阅读日
      </p>
      <details v-if="detail.books?.length">
        <summary>该月单书时长排行</summary>
        <p v-for="(book, index) in detail.books" :key="index">
          {{ index + 1 }}. {{ book.title }} · {{ duration(book.seconds) }}
        </p>
        <small>仅含该月上游已返回的排行，可能有截断与展示阈值。</small>
      </details>
      <p v-else>该月单书排行榜未取得，不使用年度榜单替代。</p>
    </template>
    <p v-else>未取得该月独立统计与书榜；下方仅筛选创建日期属于该月的已采集笔记。</p>
    <p>下载仍保留 {{ report.range.label }} 的整份已采集报告。</p>
  </section>
</template>
<style scoped>
.month-detail {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 12px;
  overflow-wrap: anywhere;
}
.month-detail h3 {
  font-size: 18px;
}
.month-detail p {
  font-size: 14px;
  margin: 8px 0;
}
.month-detail summary {
  min-height: 44px;
  align-content: center;
  cursor: pointer;
}
</style>
