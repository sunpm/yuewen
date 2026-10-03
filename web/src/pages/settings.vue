<script setup lang="ts">
import { Button } from '@/components/ui/button'
import Input from '@/components/ui/input/Input.vue'
import { useAccount } from '@client/useAccount'
const { key, show, busy, message, error, state, confirmation, save, action } = useAccount()
</script>
<template>
  <section class="settings-page wrap">
    <p class="eyebrow">账号与数据</p>
    <h1>为阅读，留一个入口。</h1>
    <p class="settings-intro">连接你的微信读书，下一次回来就可以继续。</p>
    <div v-if="error" role="alert" class="notice">{{ error }}</div>
    <div v-if="message" role="status" class="notice">{{ message }}</div>
    <article class="settings-card">
      <div class="section-heading">
        <h2>微信读书连接</h2>
        <span class="sample-badge">
          {{
            state?.status === 'valid'
              ? '已连接'
              : state?.status === 'invalid'
                ? '需要重新配置'
                : '尚未连接'
          }}
        </span>
      </div>
      <p>
        API Key 会加密保存在账号中，用于读取你的个人阅读数据。已有 Key
        不会回显，你可以随时更换或移除。
      </p>
      <p v-if="state?.status === 'invalid'" class="form-error">
        微信读书 API Key 已失效，请获取新 Key 后重新配置。
      </p>
      <a
        class="text-link"
        href="https://weread.qq.com/r/weread-skills"
        target="_blank"
        rel="noopener noreferrer"
      >
        前往微信读书获取 API Key ↗
      </a>
      <form @submit.prevent="save">
        <label for="weread-key">{{ state?.status === 'valid' ? '更换 API Key' : 'API Key' }}</label>
        <div class="key-field">
          <Input
            id="weread-key"
            v-model="key"
            :type="show ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            required
            minlength="8"
            placeholder="粘贴你的 wrk-…"
          />
          <button type="button" :aria-pressed="show" @click="show = !show">
            {{ show ? '隐藏' : '显示' }}
          </button>
        </div>
        <Button type="submit" :disabled="busy || !key.trim()">
          {{ busy ? '正在验证…' : '验证并保存' }}
        </Button>
        <p class="form-hint">验证成功后才会替换现有连接。网络故障不会清除你的原有 Key。</p>
      </form>
    </article>
    <article class="settings-card">
      <h2>密码与登录</h2>
      <p>默认使用邮箱验证码登录。你也可以通过邮件验证设置或重置密码。</p>
      <Button variant="outline" as-child>
        <RouterLink to="/login?mode=reset">设置或重置密码 →</RouterLink>
      </Button>
    </article>
    <article class="settings-card">
      <h2>你来决定，保留什么。</h2>
      <div class="setting-action">
        <div>
          <h3>清除临时报告</h3>
          <p>停止当前会话的采集，保留账号和已配置 Key。</p>
        </div>
        <Button variant="outline" :disabled="busy" @click="action('cache')">清除报告</Button>
      </div>
      <div class="setting-action">
        <div>
          <h3>退出登录</h3>
          <p>清除当前会话与临时报告，保留账号中的 Key。</p>
        </div>
        <Button variant="outline" :disabled="busy" @click="action('logout')">退出登录</Button>
      </div>
      <details>
        <summary>移除连接与删除账号</summary>
        <p>
          移除连接会删除 Key
          和该账号的所有临时报告；删除账号还会清除本站账号及全部登录会话。删除账号前需在 10
          分钟内重新登录。
        </p>
        <label for="confirmation">输入「移除连接」或「删除账号」确认操作</label>
        <Input id="confirmation" v-model="confirmation" placeholder="输入要执行的操作" />
        <div class="dialog-actions">
          <Button
            variant="outline"
            :disabled="busy || confirmation !== '移除连接'"
            @click="action('key')"
          >
            移除连接
          </Button>
          <Button
            variant="outline"
            :disabled="busy || confirmation !== '删除账号'"
            @click="action('account')"
          >
            删除账号
          </Button>
        </div>
      </details>
    </article>
  </section>
</template>
