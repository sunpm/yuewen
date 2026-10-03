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
const cover = computed(() => {
  try {
    const url = new URL(props.book.cover ?? '')
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
})
</script>
<template>
  <div class="mobile-cover" :class="`cover-tone-${(index ?? 0) % 4}`">
    <img
      v-if="cover && !failed"
      :src="cover"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <template v-else>
      <small>阅纹 · 阅读藏书</small>
      <strong>{{ book.title }}</strong>
      <span class="cover-decoration" aria-hidden="true"></span>
      <span>{{ book.author }}</span>
    </template>
  </div>
</template>
