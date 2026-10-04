import '@client/fonts.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { Locale } from 'vant'
import zhCN from 'vant/es/locale/lang/zh-CN'
import App from './App.vue'
import { reportScroll } from '@client/reportScroll'
import './style.css'

Locale.use('zh-CN', zhCN)
const reading = () => import('./pages/Reading.vue')
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('./pages/Home.vue') },
    { path: '/login', component: () => import('./pages/Login.vue') },
    { path: '/settings', component: () => import('./pages/Settings.vue') },
    ...['demo', 'overview', 'report', 'shelf', 'notes'].map((path) => ({
      path: `/${path}`,
      component: reading,
    })),
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFound.vue') },
  ],
  scrollBehavior: reportScroll,
})
router.afterEach((to) => {
  document.title = `${to.path === '/demo' ? '示例档案' : to.path === '/login' ? '邮箱登录' : '随身阅读档案'} · 阅纹`
})
createApp(App).use(router).mount('#app')
