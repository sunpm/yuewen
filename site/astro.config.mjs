import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: process.env.SITE_URL,
  integrations: [
    starlight({
      title: '阅纹',
      logo: { src: '../brand/symbol.svg', alt: '' },
      favicon: '/favicon.svg',
      locales: { root: { label: '简体中文', lang: 'zh-CN' } },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/sunpm/yuewen' }],
      sidebar: [
        {
          label: '开始使用',
          items: [{ slug: 'docs' }, { slug: 'docs/deploy' }, { slug: 'docs/connection' }],
        },
        { label: '阅读档案', items: [{ slug: 'docs/report' }, { slug: 'docs/export' }] },
      ],
      customCss: ['./src/styles/docs.css'],
    }),
  ],
})
