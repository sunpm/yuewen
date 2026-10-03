<script setup lang="ts">
import { useTheme } from '@client/useTheme'
import { Button } from '@/components/ui/button'
const { dark, toggle } = useTheme()
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
      <button
        class="theme-toggle"
        :aria-label="dark ? '切换浅色主题' : '切换深色主题'"
        @click="toggle"
      >
        {{ dark ? '☀' : '◐' }}
      </button>
      <Button variant="outline" as-child>
        <RouterLink to="/overview">
          我的阅读档案
          <span aria-hidden="true">↗</span>
        </RouterLink>
      </Button>
    </nav>
  </header>
  <main id="main"><slot /></main>
  <footer class="site-footer wrap">
    <RouterLink to="/" class="serif">阅纹</RouterLink>
    <p>每一页，都留下你的纹理。</p>
    <span><a href="/m/">打开手机版 ↗</a></span>
  </footer>
</template>
