<script setup lang="ts">
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { cva } from 'class-variance-authority'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
const props = withDefaults(
  defineProps<
    PrimitiveProps & { variant?: 'default' | 'outline' | 'ghost'; class?: HTMLAttributes['class'] }
  >(),
  { as: 'button', variant: 'default', class: '' },
)
const variants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50 min-h-11 px-6 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border border-border bg-transparent hover:bg-muted',
        ghost: 'bg-transparent hover:bg-muted',
      },
    },
  },
)
</script>
<template>
  <Primitive :as="as" :as-child="asChild" :class="cn(variants({ variant }), props.class)">
    <slot />
  </Primitive>
</template>
