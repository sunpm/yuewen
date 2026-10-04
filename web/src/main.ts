import '@client/fonts.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'
import { reportScroll } from '@client/reportScroll'
import './styles/main.css'
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: reportScroll,
})
router.afterEach((to) => {
  document.title = `${to.path === '/' ? '看见你的阅读轨迹' : to.path === '/demo' ? '示例阅读档案' : to.path === '/login' ? '登录' : to.path === '/settings' ? '账号设置' : '我的阅读档案'} · 阅纹`
})
createApp(App).use(router).mount('#app')
