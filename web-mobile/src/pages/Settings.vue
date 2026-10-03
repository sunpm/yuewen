<script setup lang="ts">
import { useAccount } from '@client/useAccount'
const { key, show, busy, message, error, state, confirmation, save, action } = useAccount()
const danger = ref(false)
</script>
<template>
  <div class="mobile-page settings-page">
    <h1>我的阅读入口</h1>
    <p class="page-description">连接一次，下次回来继续读。</p>
    <p v-if="error" class="form-message" role="alert">{{ error }}</p>
    <p v-if="message" class="form-message" role="status">{{ message }}</p>
    <van-cell-group inset title="微信读书连接">
      <van-cell
        title="连接状态"
        :value="
          state?.status === 'valid'
            ? '已连接'
            : state?.status === 'invalid'
              ? '需要重新配置'
              : '尚未连接'
        "
      />
      <van-cell title="获取 API Key" is-link url="https://weread.qq.com/r/weread-skills" />
    </van-cell-group>
    <p class="field-hint">Key 加密保存在你的账号中，已有内容不会回显。验证成功后才替换原有连接。</p>
    <van-form @submit="save">
      <van-cell-group inset>
        <van-field
          v-model="key"
          name="key"
          label="API Key"
          placeholder="粘贴你的 wrk-…"
          :type="show ? 'text' : 'password'"
          autocomplete="off"
          :rules="[{ required: true, message: '请粘贴 API Key' }]"
        >
          <template #button>
            <button class="text-button" type="button" :aria-pressed="show" @click="show = !show">
              {{ show ? '隐藏' : '显示' }}
            </button>
          </template>
        </van-field>
      </van-cell-group>
      <div class="form-actions">
        <van-button
          block
          round
          type="primary"
          native-type="submit"
          :loading="busy"
          :disabled="!key.trim()"
        >
          验证并保存
        </van-button>
      </div>
    </van-form>
    <van-cell-group inset title="账号与数据">
      <van-cell
        title="设置或重置密码"
        label="通过邮箱验证，可选密码登录"
        is-link
        to="/login?mode=reset"
      />
      <van-cell
        title="清除临时报告"
        label="停止当前会话采集，保留账号和 Key"
        is-link
        :clickable="!busy"
        @click="!busy && action('cache')"
      />
      <van-cell
        title="退出登录"
        label="保留账号中已配置的 Key"
        is-link
        :clickable="!busy"
        @click="!busy && action('logout')"
      />
      <van-cell title="移除连接与删除账号" is-link @click="danger = true" />
    </van-cell-group>
    <a href="/settings" class="desktop-link">打开桌面版 ↗</a>
    <van-popup
      v-model:show="danger"
      position="bottom"
      round
      safe-area-inset-bottom
      class="mobile-sheet"
      aria-label="移除连接与删除账号"
    >
      <button class="sheet-close icon-button" aria-label="关闭账号操作" @click="danger = false">
        <van-icon name="cross" aria-hidden="true" />
      </button>
      <h2>你来决定，保留什么。</h2>
      <p>
        移除连接会删除 Key 和临时报告。删除账号还会清除本站账号及全部会话，需在 10 分钟内重新登录。
      </p>
      <van-field
        v-model="confirmation"
        label="确认操作"
        placeholder="输入「移除连接」或「删除账号」"
      />
      <div class="form-actions">
        <van-button
          block
          round
          :disabled="busy || confirmation !== '移除连接'"
          @click="action('key')"
        >
          移除连接
        </van-button>
        <van-button
          block
          round
          type="danger"
          :disabled="busy || confirmation !== '删除账号'"
          @click="action('account')"
        >
          删除账号
        </van-button>
      </div>
    </van-popup>
  </div>
</template>
