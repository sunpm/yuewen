<script setup lang="ts">
import { Button } from '@/components/ui/button'
import Input from '@/components/ui/input/Input.vue'
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
  <section class="auth-layout wrap">
    <div class="auth-story">
      <h1>
        每次回来，
        <br />
        都有新的
        <span class="title-underline">回声。</span>
      </h1>
      <p>用一个邮箱，收好你的阅读轨迹。</p>
      <div class="auth-lines" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
        <i></i>
      </div>
      <blockquote>
        “一天读几页，
        <br />
        日子便多了一点回声。”
        <small>阅纹 · 原创示例</small>
      </blockquote>
    </div>
    <div class="auth-form-card">
      <p class="eyebrow">欢迎来到阅纹</p>
      <h2>{{ mode === 'reset' ? '重新设置密码' : '打开你的阅读档案' }}</h2>
      <p>
        {{
          mode === 'reset'
            ? '通过邮箱验证码设置新密码，也适用于首次设置密码。'
            : '第一次验证邮箱后，将自动为你创建账号。'
        }}
      </p>
      <div v-if="!configured" class="notice" role="status">
        邮箱登录服务尚未配置。你可以先浏览完整示例。
      </div>
      <div v-if="mode !== 'reset'" class="login-tabs">
        <button :class="{ active: mode === 'otp' }" @click="changeMode('otp')">邮箱验证码</button>
        <button :class="{ active: mode === 'password' }" @click="changeMode('password')">
          邮箱密码
        </button>
      </div>
      <form @submit.prevent="submit">
        <label for="email">邮箱地址</label>
        <Input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          placeholder="you@example.com"
          :disabled="busy || sent"
        />
        <button v-if="sent" type="button" class="text-link" @click="sent = false">更换邮箱</button>
        <template v-if="sent && mode !== 'password'">
          <label for="otp">6 位验证码</label>
          <Input
            id="otp"
            v-model="otp"
            type="text"
            inputmode="numeric"
            pattern="[0-9]{6}"
            maxlength="6"
            autocomplete="one-time-code"
            required
            placeholder="输入邮件中的验证码"
          />
          <p class="form-hint">验证码已发送，请查看收件箱和垃圾邮件。</p>
          <button type="button" class="text-link" :disabled="cooldown > 0 || busy" @click="send">
            {{ cooldown > 0 ? `${cooldown} 秒后重新发送` : '重新发送验证码' }}
          </button>
        </template>
        <template v-if="mode === 'password' || (mode === 'reset' && sent)">
          <label for="password">{{ mode === 'reset' ? '新密码' : '密码' }}</label>
          <Input
            id="password"
            v-model="password"
            type="password"
            :autocomplete="mode === 'reset' ? 'new-password' : 'current-password'"
            minlength="8"
            maxlength="128"
            required
            placeholder="至少 8 个字符"
          />
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <Button type="submit" class="w-full" :disabled="busy || !configured">
          {{
            busy
              ? '请稍候…'
              : mode === 'password'
                ? '登录'
                : !sent
                  ? '发送验证码'
                  : mode === 'reset'
                    ? '设置密码'
                    : '验证并继续'
          }}
          <span aria-hidden="true">→</span>
        </Button>
      </form>
      <button
        class="text-link password-link"
        @click="changeMode(mode === 'reset' ? 'otp' : 'reset')"
      >
        {{ mode === 'reset' ? '返回验证码登录' : '设置密码 / 忘记密码' }}
      </button>
      <p class="auth-bottom">
        暂时不想登录？
        <RouterLink to="/demo" class="text-link">先看示例 →</RouterLink>
      </p>
    </div>
  </section>
</template>
