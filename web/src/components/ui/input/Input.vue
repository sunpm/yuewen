<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<string | number>()
</script>
<template>
  <input
    v-model="model"
    :class="
      cn(
        'flex h-12 w-full rounded-lg border border-border bg-background px-4 text-base outline-offset-4 placeholder:text-muted-foreground disabled:opacity-50',
        props.class,
      )
    "
  />
</template>
