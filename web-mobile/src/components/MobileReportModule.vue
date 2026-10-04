<script setup lang="ts">
import type { ReportModule } from '@shared/report'
import { periodCells } from '@shared/report'
defineProps<{ module: ReportModule; generatedAt?: string }>()
defineEmits<{ select: [label: string] }>()
const open = ref(false)
const trigger = ref<HTMLButtonElement>()
const Chart = defineAsyncComponent(() => import('@client/components/ReportChart.vue'))
const labels = ['阅读时长', '阅读天数', '读过', '读完', '笔记']
</script>
<template>
  <article class="mobile-module" :data-module="module.id">
    <header class="module-top">
      <p class="eyebrow">{{ String(module.id).padStart(2, '0') }} / {{ module.section }}</p>
      <button ref="trigger" class="text-button" @click="open = true">查看更多</button>
    </header>
    <h2>{{ module.title }}</h2>
    <p class="module-description">{{ module.description }}</p>
    <p v-if="module.section !== '时间'" class="module-scope">
      {{
        module.section === '书架'
          ? '当前书架'
          : module.section === '偏好'
            ? module.scope
            : '已读取笔记 · 详见范围'
      }}
    </p>
    <van-empty
      v-if="['empty', 'unavailable'].includes(module.status)"
      image="search"
      image-size="62"
      :description="module.status === 'empty' ? '这个范围内还没有记录' : '当前数据暂不可用'"
    />
    <div v-else-if="module.periods?.length" class="period-groups">
      <section v-for="period in module.periods.slice(0, 3)" :key="period.label">
        <h3>{{ period.label }}</h3>
        <dl>
          <div v-for="(value, i) in periodCells(period)" :key="i">
            <dt>{{ labels[i] }}</dt>
            <dd>{{ value }}</dd>
          </div>
        </dl>
      </section>
    </div>
    <div v-else-if="module.kind === 'words'" class="mobile-words">
      <small>单位：{{ module.unit }}</small>
      <span
        v-for="word in module.data"
        :key="word.label"
        :title="`${word.value} ${module.unit}`"
        :style="{ fontSize: `${Math.min(28, 13 + word.value)}px` }"
      >
        {{ word.label }}
      </span>
    </div>
    <div v-else-if="module.kind === 'table'" class="module-key-values">
      <div v-for="row in module.data.slice(0, 8)" :key="row.label">
        <span>{{ row.label }}</span>
        <strong v-if="module.unit !== '日期'">
          {{ row.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }}
          {{ row.unit ?? module.unit }}
        </strong>
      </div>
    </div>
    <Chart v-else :module="module" @select="$emit('select', $event)" />
    <van-popup
      v-model:show="open"
      position="bottom"
      round
      safe-area-inset-bottom
      class="mobile-sheet module-sheet"
      :aria-label="module.title"
      @keydown.esc="open = false"
      @closed="trigger?.focus()"
    >
      <button class="sheet-close icon-button" aria-label="关闭数据详情" @click="open = false">
        <van-icon name="cross" />
      </button>
      <h2>{{ module.title }}</h2>
      <p>{{ module.description }}</p>
      <dl class="module-metadata">
        <div>
          <dt>实际范围</dt>
          <dd>{{ module.scope }}</dd>
        </div>
        <div>
          <dt>采集覆盖</dt>
          <dd>
            {{ module.coverage.loaded }} / {{ module.coverage.expected ?? '未知' }} ·
            {{ module.coverage.complete ? '已齐全' : '部分或不可用' }} · 失败
            {{ module.coverage.failed }}
          </dd>
        </div>
        <div v-if="generatedAt">
          <dt>报告采集时间</dt>
          <dd>
            {{ new Date(generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}
          </dd>
        </div>
        <div>
          <dt>来源说明</dt>
          <dd>{{ module.coverage.reason || module.description }}</dd>
        </div>
      </dl>
      <div v-if="module.periods?.length" class="period-groups">
        <section v-for="period in module.periods" :key="period.label">
          <h3>{{ period.label }}</h3>
          <small>{{ period.start || '起始未知' }} — {{ period.end }}</small>
          <dl>
            <div v-for="(value, i) in periodCells(period)" :key="i">
              <dt>{{ labels[i] }}</dt>
              <dd>{{ value }}</dd>
            </div>
          </dl>
          <p>
            统计原文：{{ period.stats.map((s) => `${s.name} ${s.text}`).join('；') || '未提供' }}
          </p>
        </section>
      </div>
      <table v-else-if="module.data.length">
        <thead>
          <tr>
            <th>项目</th>
            <th>数值与单位</th>
            <th v-if="module.kind === 'scatter'">进度 %</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in module.data" :key="i">
            <td>{{ row.label }}</td>
            <td>
              {{
                module.unit === '日期'
                  ? '最近活动'
                  : `${row.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${row.unit ?? module.unit}`
              }}
            </td>
            <td v-if="module.kind === 'scatter'">{{ row.secondary ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>当前没有可展示的明细。</p>
    </van-popup>
  </article>
</template>
