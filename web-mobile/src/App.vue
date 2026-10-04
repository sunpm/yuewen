<script setup lang="ts">
import { useTheme } from '@client/useTheme'
const { dark, toggle } = useTheme()
const route = useRoute()
const demo = computed(() => route.path === '/demo')
const active = computed(() => {
  const view = demo.value ? String(route.query.view ?? 'overview') : route.path.slice(1)
  return ['overview', 'shelf', 'notes'].includes(view)
    ? view
    : view === 'report'
      ? 'overview'
      : 'settings'
})
const destination = (view: string) =>
  demo.value && view !== 'settings'
    ? {
        path: '/demo',
        query: {
          ...route.query,
          view,
          book: view === 'notes' ? route.query.book : undefined,
          month: view === 'notes' ? route.query.month : undefined,
        },
      }
    : {
        path: `/${view}`,
        query: {
          ...route.query,
          view: undefined,
          book: view === 'notes' ? route.query.book : undefined,
          month: view === 'notes' ? route.query.month : undefined,
        },
      }
</script>
<template>
  <van-config-provider :theme="dark ? 'dark' : 'light'" theme-vars-scope="global">
    <header class="mobile-header">
      <RouterLink to="/" class="mobile-brand" aria-label="阅纹首页">
        <img
          :src="`/brand/logo-mark-${dark ? 'dark' : 'light'}.svg`"
          alt=""
          width="29"
          height="24"
        />
        <span>阅纹</span>
      </RouterLink>
      <span class="header-caption">看见你的阅读轨迹</span>
      <button
        class="icon-button"
        :aria-label="dark ? '切换浅色主题' : '切换深色主题'"
        @click="toggle"
      >
        <span aria-hidden="true">{{ dark ? '☀' : '◐' }}</span>
      </button>
    </header>
    <main id="main"><RouterView :key="route.path" /></main>
    <van-tabbar
      v-if="!['/', '/login'].includes(route.path)"
      :model-value="active"
      placeholder
      safe-area-inset-bottom
      aria-label="底部导航"
    >
      <van-tabbar-item
        name="overview"
        aria-label="档案"
        icon="bar-chart-o"
        :to="destination('overview')"
      >
        档案
      </van-tabbar-item>
      <van-tabbar-item name="shelf" aria-label="书架" icon="apps-o" :to="destination('shelf')">
        书架
      </van-tabbar-item>
      <van-tabbar-item name="notes" aria-label="笔记" icon="records-o" :to="destination('notes')">
        笔记
      </van-tabbar-item>
      <van-tabbar-item
        name="settings"
        aria-label="我的"
        icon="user-o"
        :to="destination('settings')"
      >
        我的
      </van-tabbar-item>
    </van-tabbar>
  </van-config-provider>
</template>
