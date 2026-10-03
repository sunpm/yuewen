<script setup lang="ts">
import type { Book } from '@shared/report'
const props = defineProps<{ book: Book; index?: number }>()
const failed = ref(false)
watch(
  () => [props.book.id, props.book.cover],
  () => {
    failed.value = false
  },
)
const safeCover = computed(() => {
  try {
    const url = new URL(props.book.cover ?? '')
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
})
</script>
<template>
  <div class="book-cover" :class="`cover-${(index ?? 0) % 6}`">
    <img
      v-if="safeCover && !failed"
      :src="safeCover"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <template v-else>
      <span class="cover-imprint">阅纹 · 阅读藏书</span>
      <strong>{{ book.title }}</strong>
      <span class="cover-lines" aria-hidden="true"></span>
      <small>{{ book.author }}</small>
      <span class="cover-number" aria-hidden="true">
        {{ String((index ?? 0) + 1).padStart(2, '0') }}
      </span>
    </template>
  </div>
</template>
