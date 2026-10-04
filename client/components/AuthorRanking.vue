<script setup lang="ts">
import type { Datum } from '@shared/report'
defineProps<{ data: Datum[] }>()
</script>
<template>
  <div class="author-ranking">
    <p>
      按阅读本数
      <span v-if="data.length > 5">· 前 5 位</span>
    </p>
    <ol>
      <li v-for="(author, i) in data.slice(0, 5)" :key="i">
        <div class="author-heading">
          <span>{{ author.label }}</span>
          <strong>{{ author.value.toLocaleString('zh-CN') }} 本</strong>
        </div>
        <div class="author-detail">
          <small>阅读 {{ author.readTime || '—' }}</small>
          <span class="author-track" aria-hidden="true">
            <span
              :style="{
                width: `${(author.value / Math.max(1, ...data.map((d) => d.value))) * 100}%`,
              }"
            ></span>
          </span>
        </div>
      </li>
    </ol>
  </div>
</template>
<style scoped>
.author-ranking {
  margin-top: 16px;
}
.author-ranking p,
.author-detail small {
  font-size: 12px;
  opacity: 0.8;
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  padding: 14px 0;
}
.author-heading {
  display: flex;
  align-items: baseline;
  gap: 16px;
}
.author-heading > span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.author-heading strong {
  flex-shrink: 0;
  font-weight: 500;
  white-space: nowrap;
}
.author-detail {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 6px;
}
.author-detail small {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.author-track {
  width: 45%;
  height: 5px;
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 12%, transparent);
}
.author-track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary, var(--brand));
}
</style>
