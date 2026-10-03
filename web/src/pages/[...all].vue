<script setup lang="ts">
import { Button } from '@/components/ui/button'
</script>
<template>
  <section class="empty-state wrap">
    <p class="eyebrow">404 / 这一页不在书里</p>
    <h1>回到故事开始的地方。</h1>
    <Button as-child><RouterLink to="/">返回首页</RouterLink></Button>
  </section>
</template>
