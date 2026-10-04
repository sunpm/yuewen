<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '../api'
import { useReport } from '../useReport'
const route = useRoute(),
  router = useRouter(),
  personal = useReport()
const busy = ref(false),
  message = ref(''),
  conflict = ref<unknown>(null)
async function begin() {
  const reportId = personal.task.value?.id
  if (!reportId) {
    message.value = '请先生成报告，再保存连接。'
    return
  }
  const query = {
    ...route.query,
    connection: 'guest',
    save: crypto.randomUUID(),
    saveReport: reportId,
  }
  const next = router.resolve({ path: route.path, query }).fullPath
  try {
    const available = await api<import('../useConnection').Connections>('/connections')
    if (available.account) {
      await router.replace({ query })
      return
    }
  } catch {
    /* Login offers a return to the still-valid guest report. */
  }
  await router.push({ path: '/login', query: { next } })
}
async function save(replace = false) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  await personal.settle()
  try {
    const saved = await api<{ reportId: string; range: string }>('/guest/save', {
      method: 'POST',
      body: JSON.stringify({
        requestId: route.query.save,
        reportId: route.query.saveReport,
        ...(replace ? { expected: conflict.value, replace } : {}),
      }),
    })
    await router.replace({
      query: {
        ...route.query,
        connection: 'account',
        range: saved.range,
        save: undefined,
        saveReport: undefined,
      },
    })
  } catch (e) {
    if (e instanceof ApiError && e.code === 'SAVE_CONFLICT') conflict.value = e.details
    if (e instanceof ApiError && e.code === 'SAVE_RESULT_EXPIRED') {
      await router.replace({ path: '/settings', query: { connection: 'account' } })
      return
    }
    message.value = e instanceof Error ? e.message : '保存失败，请重试确认原保存结果。'
  } finally {
    busy.value = false
  }
}
function keep() {
  conflict.value = null
  message.value = ''
  void router.replace({ query: { ...route.query, save: undefined, saveReport: undefined } })
}
watch(
  () => route.query.save,
  (id) => {
    if (typeof id === 'string' && /^[\da-f-]{36}$/i.test(id) && route.query.connection === 'guest')
      void save()
  },
  { immediate: true },
)
</script>
<template>
  <aside v-if="route.query.connection === 'guest'" class="connection-notice">
    <p>临时连接 · 闲置 30 分钟、最长 2 小时后清理。Key 在服务端加密暂存，报告可直接下载。</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="busy" role="status">正在保存连接并确认原报告…</p>
    <div v-else-if="conflict" class="connection-actions">
      <button type="button" @click="save(true)">替换账号现有连接或临时报告，保存本次结果</button>
      <button type="button" @click="keep">保留账号现状，继续临时查看</button>
    </div>
    <div v-else class="connection-actions">
      <button v-if="!route.query.save" type="button" @click="begin">保存连接，下次直接查看</button>
      <button v-else type="button" @click="save()">重试确认保存结果</button>
      <RouterLink
        :to="{ path: '/settings', query: { connection: 'guest', range: route.query.range } }"
      >
        管理临时连接
      </RouterLink>
      <RouterLink
        :to="{ path: '/settings', query: { connection: 'account', range: route.query.range } }"
      >
        使用账号连接
      </RouterLink>
      <button v-if="route.query.save" type="button" @click="keep">继续临时查看</button>
    </div>
  </aside>
</template>
<style scoped>
.connection-notice {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid currentColor;
  border-radius: 12px;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.connection-notice p {
  margin: 0 0 8px;
}
.connection-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.connection-actions button,
.connection-actions a {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-align: left;
}
</style>
