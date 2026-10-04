<script setup lang="ts">
import type { ReportModule } from '@shared/report'
import { periodCells } from '@shared/report'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
defineProps<{ module: ReportModule; generatedAt?: string }>()
defineEmits<{ select: [label: string] }>()
const Chart = defineAsyncComponent(() => import('@client/components/ReportChart.vue'))
</script>
<template>
  <article
    class="module-card"
    :class="{ 'module-calendar': module.kind === 'heatmap', 'module-periods': module.id === 7 }"
    :data-module="module.id"
  >
    <header>
      <p class="eyebrow">{{ String(module.id).padStart(2, '0') }} / {{ module.section }}</p>
      <Dialog>
        <DialogTrigger class="text-link module-more">查看更多</DialogTrigger>
        <DialogContent class="module-dialog">
          <DialogTitle>{{ module.title }}</DialogTitle>
          <DialogDescription>{{ module.description }}</DialogDescription>
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
          <Table v-if="module.periods?.length" class="period-table">
            <TableHeader>
              <TableRow>
                <TableHead
                  v-for="label in ['时间', '阅读时长', '阅读天数', '读过', '读完', '笔记']"
                  :key="label"
                >
                  {{ label }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="period in module.periods" :key="period.label">
                <TableCell>
                  {{ period.label }}
                  <small>{{ period.start || '起始未知' }} — {{ period.end }}</small>
                </TableCell>
                <TableCell v-for="(value, i) in periodCells(period)" :key="i">
                  {{ value }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-if="module.periods?.length" class="raw-statistics">
            <h4>统计明细原文</h4>
            <p v-for="period in module.periods" :key="period.label">
              {{ period.label }}：{{
                period.stats.map((s) => `${s.name} ${s.text}`).join('；') || '未提供统计摘要'
              }}
            </p>
          </div>
          <Table v-else-if="module.data.length">
            <TableHeader>
              <TableRow>
                <TableHead>项目</TableHead>
                <TableHead>数值与单位</TableHead>
                <TableHead v-if="module.kind === 'scatter'">进度 %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(row, i) in module.data" :key="i">
                <TableCell>{{ row.label }}</TableCell>
                <TableCell>
                  {{
                    module.unit === '日期'
                      ? '最近一次活动'
                      : `${row.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} ${row.unit ?? module.unit}`
                  }}
                </TableCell>
                <TableCell v-if="module.kind === 'scatter'">{{ row.secondary ?? '—' }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p v-else>当前没有可展示的明细。{{ module.coverage.reason || module.description }}</p>
        </DialogContent>
      </Dialog>
    </header>
    <h3>{{ module.title }}</h3>
    <p class="module-description">{{ module.description }}</p>
    <p v-if="module.section !== '时间'" class="module-scope">
      {{
        module.section === '书架'
          ? '当前书架'
          : module.section === '偏好'
            ? module.scope
            : module.scope.replace(/\d{4}-\d{2}-\d{2}/g, '').trim()
      }}
    </p>
    <div v-if="['unavailable', 'empty'].includes(module.status)" class="chart-empty">
      {{ module.status === 'empty' ? '这个范围内还没有记录' : '当前数据暂不可用' }}
    </div>
    <Table v-else-if="module.periods?.length" class="period-table">
      <TableHeader>
        <TableRow>
          <TableHead v-for="label in ['时间', '时长', '天数', '读过', '读完', '笔记']" :key="label">
            {{ label }}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="period in module.periods.slice(0, 4)" :key="period.label">
          <TableCell>{{ period.label }}</TableCell>
          <TableCell v-for="(value, i) in periodCells(period)" :key="i">{{ value }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div v-else-if="module.kind === 'words'" class="word-cloud">
      <small>单位：{{ module.unit }}</small>
      <span
        v-for="(word, i) in module.data"
        :key="word.label"
        :title="`${word.value} ${module.unit}`"
        :style="{ fontSize: `${Math.min(30, 13 + word.value)}px`, opacity: 1 - (i % 3) * 0.12 }"
      >
        {{ word.label }}
      </span>
    </div>
    <div v-else-if="module.kind === 'table'" class="module-rows">
      <div v-for="row in module.data.slice(0, 8)" :key="row.label">
        <span>{{ row.label }}</span>
        <strong v-if="module.unit !== '日期'">
          {{ row.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }}
          {{ row.unit ?? module.unit }}
        </strong>
      </div>
    </div>
    <Chart v-else :module="module" @select="$emit('select', $event)" />
  </article>
</template>
