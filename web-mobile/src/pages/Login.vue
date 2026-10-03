<script setup lang="ts">
import { useLogin } from '@client/useLogin'
const {
  email,
  otp,
  password,
  mode,
  sent,
  busy,
  error,
  cooldown,
  configured,
  send,
  submit,
  changeMode,
} = useLogin()
</script>
<template>
  <div class="mobile-page login-page">
    <h1>{{ mode === 'reset' ? '重新设置密码' : '让阅读，有处安放。' }}</h1>
    <p class="page-description">
      {{
        mode === 'reset' ? '使用邮箱验证码设置或重置密码。' : '第一次验证邮箱后，会自动创建账号。'
      }}
    </p>
    <van-notice-bar
      v-if="!configured"
      wrapable
      :scrollable="false"
      text="邮箱登录服务尚未配置。你可以先浏览完整示例。"
    />
    <van-tabs v-if="mode !== 'reset'" :active="mode" @change="changeMode">
      <van-tab title="邮箱验证码" name="otp" />
      <van-tab title="邮箱密码" name="password" />
    </van-tabs>
    <van-form @submit="submit">
      <van-cell-group inset>
        <van-field
          v-model="email"
          name="email"
          label="邮箱"
          placeholder="you@example.com"
          type="email"
          autocomplete="email"
          :disabled="busy || sent"
          :rules="[
            { required: true, message: '请输入邮箱地址' },
            { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '请检查邮箱格式' },
          ]"
        />
        <van-field
          v-if="sent && mode !== 'password'"
          v-model="otp"
          name="otp"
          label="验证码"
          placeholder="6 位邮箱验证码"
          type="digit"
          maxlength="6"
          autocomplete="one-time-code"
          :rules="[{ pattern: /^\d{6}$/, message: '请输入 6 位验证码' }]"
        >
          <template #button>
            <van-button
              native-type="button"
              size="small"
              :disabled="cooldown > 0 || busy"
              @click="send"
            >
              {{ cooldown ? `${cooldown} 秒` : '重新发送' }}
            </van-button>
          </template>
        </van-field>
        <van-field
          v-if="mode === 'password' || (mode === 'reset' && sent)"
          v-model="password"
          name="password"
          label="密码"
          placeholder="至少 8 位"
          type="password"
          :autocomplete="mode === 'reset' ? 'new-password' : 'current-password'"
          :rules="[
            {
              validator: (value: string) => value.length >= 8 && value.length <= 128,
              message: '密码需为 8–128 位',
            },
          ]"
        />
      </van-cell-group>
      <p v-if="sent" class="field-hint">验证码已发送，请查看收件箱和垃圾邮件。</p>
      <p v-if="error" class="form-message" role="alert">{{ error }}</p>
      <div class="form-actions">
        <van-button
          type="primary"
          round
          block
          native-type="submit"
          :loading="busy"
          :disabled="!configured"
        >
          {{
            mode === 'password'
              ? '登录'
              : !sent
                ? '发送验证码'
                : mode === 'reset'
                  ? '保存新密码'
                  : '验证并登录'
          }}
        </van-button>
        <van-button v-if="sent" plain round block native-type="button" @click="sent = false">
          更换邮箱
        </van-button>
      </div>
    </van-form>
    <button class="text-button" @click="changeMode(mode === 'reset' ? 'otp' : 'reset')">
      {{ mode === 'reset' ? '返回验证码登录' : '设置或忘记密码？' }}
    </button>
    <RouterLink to="/demo" class="text-button">先查看完整示例 →</RouterLink>
  </div>
</template>
