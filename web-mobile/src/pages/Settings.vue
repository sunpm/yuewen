<script setup lang="ts">
import FeedbackLink from '@client/components/FeedbackLink.vue'
import { useAccount } from '@client/useAccount'
const { guest, connection, key, show, busy, message, error, state, confirmation, save, action } =
  useAccount()
const danger = ref(false)
const route = useRoute()
</script>
<template>
  <div class="mobile-page settings-page">
    <h1>我的阅读入口</h1>
    <p class="page-description">粘贴 Key 即可查看和下载，需要下次免填时再登录。</p>
    <p v-if="guest" class="field-hint">
      临时连接闲置 30 分钟、最长 2 小时后清理；Key 在服务端加密暂存。关闭页面停止后续采集。
    </p>
    <van-cell-group inset>
      <van-cell
        :title="guest ? '使用账号连接' : '另用临时连接'"
        is-link
        :to="{ path: '/settings', query: { connection: guest ? 'account' : 'guest' } }"
      />
      <van-cell
        v-if="!guest"
        title="登录恢复已保存连接"
        is-link
        to="/login?next=/settings%3Fconnection%3Daccount"
      />
      <van-cell
        v-if="state?.status === 'valid'"
        title="继续查看报告"
        is-link
        :to="{ path: '/overview', query: { connection } }"
      />
    </van-cell-group>
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
    <p class="field-hint">
      {{
        guest ? 'Key 加密暂存，仅用于临时连接。' : 'Key 加密保存在你的账号中。'
      }}已有内容不会回显，验证成功后才替换原有连接。
    </p>
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
          {{ guest ? '验证并生成' : '验证并保存' }}
        </van-button>
      </div>
    </van-form>
    <van-cell-group inset title="账号与数据">
      <van-cell
        v-if="!guest"
        title="设置或重置密码"
        label="通过邮箱验证，可选密码登录"
        is-link
        to="/login?mode=reset"
      />
      <van-cell
        title="清除临时报告"
        label="停止当前连接采集，保留 Key"
        is-link
        :clickable="!busy"
        @click="!busy && action('cache')"
      />
      <van-cell
        v-if="!guest"
        title="退出登录"
        label="保留账号中已配置的 Key"
        is-link
        :clickable="!busy"
        @click="!busy && action('logout')"
      />
      <van-cell
        :title="guest ? '清除临时连接' : '移除连接与删除账号'"
        is-link
        @click="danger = true"
      />
    </van-cell-group>
    <a :href="route.fullPath" class="desktop-link">打开桌面版 ↗</a>
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
        {{
          guest
            ? '清除临时连接会删除游客 Key 和临时报告，不影响账号。'
            : '移除连接会删除账号 Key 和临时报告。删除账号还会清除本站账号及全部会话，需在 10 分钟内重新登录。'
        }}
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
          v-if="!guest"
          :disabled="busy || confirmation !== '删除账号'"
          @click="action('account')"
        >
          删除账号
        </van-button>
      </div>
    </van-popup>
    <FeedbackLink />
  </div>
</template>
