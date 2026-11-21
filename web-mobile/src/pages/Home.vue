<script setup lang="ts">
import FeedbackLink from '@client/components/FeedbackLink.vue'
</script>
<template>
  <div class="mobile-home">
    <h1>
      每一页，
      <br />
      都在成为你。
    </h1>
    <p class="home-description">
      走过的故事，留下的句子。
      <br />
      把微信读书里的日常，收进随身的阅读档案。
    </p>
    <div class="mobile-book-art" aria-hidden="true">
      <div class="art-book art-book-back">
        <span>慢下来以后</span>
      </div>
      <div class="art-book art-book-front">
        <span>山野来信</span>
        <i></i>
        <small>阅纹 · 原创示例</small>
      </div>
      <div class="art-caption">读过的，都会留下纹理。</div>
    </div>
    <div class="home-actions">
      <van-button type="primary" block round size="large" to="/settings">查看我的阅读</van-button>
      <van-button plain block round size="large" to="/demo">先翻翻示例</van-button>
    </div>
    <div class="home-features">
      <div>
        <van-icon name="clock-o" />
        <strong>阅读节律</strong>
        <span>看看时间如何流过书页</span>
      </div>
      <div>
        <van-icon name="description-o" />
        <strong>书架与笔记</strong>
        <span>重新遇见让你停下的句子</span>
      </div>
      <div>
        <van-icon name="down" />
        <strong>随身带走</strong>
        <span>下载可离线阅读的报告</span>
      </div>
    </div>
    <p class="privacy-note">
      示例可直接体验。私有报告需通过实例访问保护，可下载为离线档案。
    </p>
    <a class="desktop-link" href="/">打开桌面版 ↗</a>
    <FeedbackLink />
  </div>
</template>
