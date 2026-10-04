<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { createDemo } from '@shared/demo'
const demo = createDemo()
</script>
<template>
  <section class="landing-hero wrap">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="tiny-dot"></span>
        你的个人阅读档案
      </p>
      <h1>
        每一页，
        <br />
        都在成为
        <span class="title-underline">你。</span>
      </h1>
      <p class="hero-description">
        那些读过的书、划过的句子，
        <br />
        和安静投入的时间，都值得被看见。
      </p>
      <div class="hero-actions">
        <Button as-child>
          <RouterLink to="/settings">
            查看我的阅读
            <span aria-hidden="true">↗</span>
          </RouterLink>
        </Button>
        <RouterLink class="text-link" to="/demo">
          先翻翻示例
          <span aria-hidden="true">→</span>
        </RouterLink>
      </div>
      <p class="hero-caption">连接微信读书 · 让阅读留下清晰的纹理</p>
    </div>
    <div class="hero-art" aria-label="原创示例阅读档案预览">
      <div class="orbit orbit-one"></div>
      <div class="orbit orbit-two"></div>
      <div class="hero-book hero-book-back"><BookCover :book="demo.books[3]" :index="3" /></div>
      <div class="hero-book hero-book-front"><BookCover :book="demo.books[0]" :index="0" /></div>
      <div class="art-note">
        <span class="eyebrow">留给自己的时间</span>
        <strong>
          {{ Math.round((demo.summary.seconds ?? 0) / 3600) }}
          <small>小时</small>
        </strong>
        <div class="mini-bars" aria-hidden="true">
          <i
            v-for="(n, i) in [32, 48, 37, 65, 51, 79, 62, 87, 75, 96, 83, 100]"
            :key="i"
            :style="{ height: `${n}%` }"
          ></i>
        </div>
        <span>一点一滴，汇成阅读的轨迹。</span>
      </div>
      <span class="sample-stamp">原创示例</span>
    </div>
  </section>
  <section class="intro-strip wrap">
    <p>阅读的意义，不止于读完。</p>
    <span>把散落的阅读片刻，整理成一份可以回望的个人档案。</span>
    <span aria-hidden="true">↓</span>
  </section>
  <section class="features wrap">
    <article>
      <span class="feature-index">01 / 时间的纹理</span>
      <h2>看见日常的积累</h2>
      <p>从每天的几分钟，到一年里的阅读节律。找到属于你的节奏。</p>
      <div class="feature-track" aria-hidden="true">
        <i
          v-for="i in 42"
          :key="i"
          :style="{ opacity: i % 7 === 0 ? 0.12 : 0.2 + ((i * 7) % 10) / 13 }"
        ></i>
      </div>
    </article>
    <article>
      <span class="feature-index">02 / 思想的坐标</span>
      <h2>重逢书里的世界</h2>
      <p>浏览自己的书架，回看与哪些作者、哪些主题相伴更久。</p>
      <div class="feature-tags">
        <span>文学</span>
        <span>自然</span>
        <span>社会</span>
        <span>哲学</span>
      </div>
    </article>
    <article>
      <span class="feature-index">03 / 留下的回声</span>
      <h2>让好句子再次发生</h2>
      <p>那些让你停下来的文字，也许会在今天，带来新的理解。</p>
      <blockquote>
        “生活中的诗意，常常藏在我们愿意再看一眼的地方。”
        <small>— 原创示例《日常的诗意》</small>
      </blockquote>
    </article>
  </section>
  <section class="landing-end wrap">
    <p class="eyebrow">从一次连接开始</p>
    <h2>读过的路，值得回望。</h2>
    <p>
      无需登录，连接自己的微信读书 API Key 即可查看与下载。
      <br />
      Key 加密保存，临时报告可随时清除，也可以下载留存。
    </p>
    <Button as-child>
      <RouterLink to="/settings">
        开始记录
        <span aria-hidden="true">↗</span>
      </RouterLink>
    </Button>
  </section>
</template>
