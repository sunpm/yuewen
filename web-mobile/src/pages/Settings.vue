<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@client/api'
import type { Connections } from '@shared/connection'
const status = ref('正在检查…'),
  error = ref(''),
  confirm = ref(false),
  busy = ref(false)
async function check() {
  try {
    const data = await api<Connections>('/connections')
    status.value =
      data.instance.status === 'valid' ? '已配置（尚未验证有效性）' : '尚未配置，请联系实例部署者'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法连接'
  }
}
async function clear() {
  busy.value = true
  try {
    await api('/session/reports', { method: 'DELETE' })
    confirm.value = false
    status.value = '当前报告已清除'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busy.value = false
  }
}
onMounted(check)
</script>
<template>
  <div class="mobile-page settings-page">
    <h1>微信读书连接</h1>
    <p>无需阅纹账号。读取授权由实例部署者管理，数据受部署访问保护。</p>
    <p>{{ status }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <van-button @click="check">重新检查</van-button>
    <van-cell title="获取微信读书读取授权" is-link url="https://weread.qq.com/r/weread-skills" />
    <van-cell title="查看报告" is-link to="/overview?connection=instance" />
    <p>当前报告保留两小时，可下载 HTML / JSON。历史存档在桌面入口管理。</p>
    <van-button v-if="!confirm" @click="confirm = true">清除当前报告</van-button>
    <template v-else>
      <van-button :loading="busy" @click="clear">确认清除</van-button>
      <van-button @click="confirm = false">取消</van-button>
    </template>
    <a href="/archives">历史报告</a>
  </div>
</template>
