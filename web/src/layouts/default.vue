<script setup lang="ts">
import { useTheme } from '@client/useTheme'
import FeedbackLink from '@client/components/FeedbackLink.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Theme } from '@client/useTheme'
import { Button } from '@/components/ui/button'
const { dark, preference, setTheme } = useTheme()
const route = useRoute()
</script>
<template>
  <a class="skip-link" href="#main">跳至主要内容</a>
  <header class="site-header wrap">
    <RouterLink to="/" class="brand" aria-label="阅纹首页">
      <img :src="`/brand/logo-mark-${dark ? 'dark' : 'light'}.svg`" width="36" height="29" alt="" />
      <span>阅纹</span>
    </RouterLink>
    <nav aria-label="主导航">
      <RouterLink to="/demo">探索示例</RouterLink>
      <Select :model-value="preference" @update:model-value="setTheme($event as Theme)">
        <SelectTrigger class="w-auto min-w-20" aria-label="选择主题"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">自动（跟随系统）</SelectItem>
          <SelectItem value="light">浅色</SelectItem>
          <SelectItem value="dark">深色</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" as-child>
        <RouterLink to="/overview">
          查看我的阅读
          <span aria-hidden="true">↗</span>
        </RouterLink>
      </Button>
    </nav>
  </header>
  <main id="main"><slot /></main>
  <footer class="site-footer wrap">
    <RouterLink to="/" class="serif">阅纹</RouterLink>
    <p>每一页，都留下你的纹理。</p>
    <FeedbackLink />
    <span><a :href="`/m${route.fullPath}`">打开手机版 ↗</a></span>
  </footer>
</template>
