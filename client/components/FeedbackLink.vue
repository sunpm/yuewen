<script setup lang="ts">
import { ref } from 'vue'
import { feedbackEmail as email, feedbackMailto as mailto } from '../feedback'
const message = ref('')
async function copy() {
  try {
    await navigator.clipboard.writeText(email)
    message.value = '邮箱已复制。'
  } catch {
    message.value = '暂时无法自动复制，请选中上方邮箱手动复制。'
  }
}
</script>
<template>
  <details class="feedback">
    <summary>意见反馈</summary>
    <div class="feedback-content">
      <p>产品建议或问题反馈，欢迎联系。</p>
      <p class="feedback-email">{{ email }}</p>
      <div class="feedback-actions">
        <a :href="mailto">发送邮件</a>
        <button type="button" @click="copy">复制邮箱</button>
      </div>
      <p v-if="message" role="status">{{ message }}</p>
    </div>
  </details>
</template>
<style scoped>
.feedback {
  font-size: 14px;
}
.feedback summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.feedback-content {
  padding: 12px 0;
  max-width: 28rem;
}
.feedback-email {
  user-select: all;
  overflow-wrap: anywhere;
}
.feedback-actions {
  display: flex;
  gap: 24px;
}
.feedback-actions a,
.feedback-actions button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  text-decoration: underline;
}
.feedback p {
  margin: 4px 0;
}
</style>
