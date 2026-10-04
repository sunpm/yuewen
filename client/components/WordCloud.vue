<script setup lang="ts">
import { ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import type { ReportModule } from '@shared/report'
import { layoutWords } from '@client/wordCloud'
import { readingFont } from '@client/fonts'
const props = defineProps<{ module: ReportModule }>()
const host = ref<HTMLElement>()
const width = ref(0)
const layout = shallowRef<Awaited<ReturnType<typeof layoutWords>>>()
const selected = ref('')
const error = ref('')
let observer: ResizeObserver | undefined
watch([() => props.module, width], async (_, __, onCleanup) => {
  let current = true
  onCleanup(() => {
    current = false
  })
  layout.value = undefined
  selected.value = ''
  error.value = ''
  if (!width.value) return
  try {
    const next = await layoutWords(props.module.data, width.value)
    if (current) layout.value = next
  } catch {
    if (current) error.value = '词云暂时无法绘制，完整词频可在查看更多中查看。'
  }
})
onMounted(() => {
  observer = new ResizeObserver(() => {
    width.value = host.value?.clientWidth ?? 0
  })
  observer.observe(host.value!)
})
onUnmounted(() => observer?.disconnect())
const describe = (label: string, value: number) => `${label}：${value} ${props.module.unit}`
</script>
<template>
  <div ref="host" class="word-cloud">
    <svg
      v-if="layout"
      :viewBox="`0 0 ${layout.width} ${layout.height}`"
      :style="{ fontFamily: readingFont }"
      role="group"
      :aria-label="`${module.title}，点按词语查看频次`"
    >
      <g :transform="`translate(${layout.width / 2}, ${layout.height / 2})`" text-anchor="middle">
        <text
          v-for="(word, i) in layout.words"
          :key="word.label"
          :x="word.x"
          :y="word.y"
          :font-size="word.size"
          :class="`word-tone-${i % 3}`"
          tabindex="0"
          role="button"
          :aria-label="describe(word.label, word.value)"
          @mouseenter="selected = describe(word.label, word.value)"
          @focus="selected = describe(word.label, word.value)"
          @click="selected = describe(word.label, word.value)"
          @keydown.enter.prevent="selected = describe(word.label, word.value)"
          @keydown.space.prevent="selected = describe(word.label, word.value)"
        >
          <title>{{ describe(word.label, word.value) }}</title>
          {{ word.text }}
        </text>
      </g>
    </svg>
    <p v-else-if="error" role="status">{{ error }}</p>
    <p v-else role="status">正在排布词云…</p>
    <p v-if="layout" class="word-tooltip" aria-live="polite">
      {{ selected || '点按词语查看频次' }}
    </p>
    <small v-if="layout && layout.words.length < module.data.length">
      云图展示 {{ layout.words.length }} / {{ module.data.length }} 个词，完整词频见查看更多。
    </small>
    <small v-if="layout?.words.some((word) => word.text !== word.label)">
      长词已省略显示，点按或打开词频表查看完整词语。
    </small>
  </div>
</template>
<style scoped>
.word-cloud {
  margin-top: 12px;
  min-height: 280px;
}
svg {
  display: block;
  width: 100%;
  height: auto;
}
text {
  cursor: pointer;
}
.word-tone-0 {
  fill: var(--primary, var(--brand));
}
.word-tone-1 {
  fill: var(--accent);
}
.word-tone-2 {
  fill: currentColor;
}
.word-tooltip {
  min-height: 1.8em;
  text-align: center;
  font-size: 12px;
  overflow-wrap: anywhere;
}
small {
  display: block;
  font-size: 12px;
  opacity: 0.8;
}
</style>
