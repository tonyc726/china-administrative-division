import { defineConfig } from 'vitepress';

// 多平台部署：GitHub Pages 需要 /<repo>/ 前缀，Vercel/Netlify/Cloudflare 用根路径 /。
// 部署时用 DOCS_BASE 覆盖，例如 GH Pages: DOCS_BASE=/china-administrative-division/
const base = process.env.DOCS_BASE ?? '/';

// OG/分享图与 canonical 需要绝对 URL。默认 GH Pages 地址（含项目名路径，与 DOCS_BASE 对应）；
// 部署到 Cloudflare/Vercel/Netlify 根域时用 DOCS_SITE_URL 覆盖（同时把 DOCS_BASE 设回 /）。
const siteUrl = (
  process.env.DOCS_SITE_URL ??
  'https://tonyc726.github.io/china-administrative-division'
).replace(/\/$/, '');

const REPO = 'https://github.com/tonyc726/china-administrative-division';

// 文档站现在是主站的辅助链接（主站部署在 GH Pages 根路径，文档站挂在 /docs/ 子路径）。
// 只有 GH Pages 构建会设置这个变量，其它独立部署（Cloudflare/Vercel）没有主站，不渲染这条 nav。
const homeUrl = process.env.DOCS_HOME_URL;

const contributorSidebar = [
  {
    text: '贡献者',
    items: [
      { text: '从这里开始', link: '/contributors/' },
      { text: '贡献 Patch', link: '/contributors/patch' },
      { text: '发布到 npm', link: '/contributors/publishing' },
      { text: '@cndiv/crawler', link: '/contributors/crawler' },
      { text: '@cndiv/extractor', link: '/contributors/extractor' },
    ],
  },
  {
    text: '设计与运维',
    items: [
      { text: '架构设计', link: '/ops/architecture' },
      { text: '采集运维手册', link: '/ops/crawl-runbook' },
      { text: '采集现状评估', link: '/ops/collection-assessment' },
      { text: 'Patch 校验', link: '/ops/patch-verify' },
      { text: '统计用区划代码编制规则', link: '/ops/rule-nbs' },
      { text: '县以下区划代码编制规则', link: '/ops/rule-sub-county' },
    ],
  },
];

export default defineConfig({
  lang: 'zh-CN',
  title: '全国行政区划代码',
  description:
    '全国五级行政区划代码，1980–2023 历年版本，一条命令装到本地 SQLite。',
  base,

  // 用户页用站内绝对路径，死链会让构建失败。
  // 仍 @include 的维护者原文（docs/ 与包 README）里有给 GitHub 看的相对链接，
  // 那些邻居文件不在站点路由上。只放过 ./ 与 ../，不放过 /guide 这类站内路径。
  ignoreDeadLinks: [(url) => url.startsWith('./') || url.startsWith('../')],

  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,

  // china-id-card sets `appearance: 'light'`. VitePress 1.6.4 has no `'light'`
  // string — that value falls through to system `auto` after hydration. The
  // object form is what both the pre-paint script and useDark honor, so the
  // site opens light and the toggle still reaches dark.
  appearance: {
    initialValue: 'light' as 'dark',
  },

  head: [
    [
      'link',
      { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` },
    ],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    ],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
    [
      'meta',
      {
        name: 'keywords',
        content:
          '中国行政区划,行政区划代码,GB2260,统计用区划代码,NBS,城乡划分代码,国家地名信息库,dmfw,邮编,区号,SQLite,行政区划历史数据',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '全国行政区划代码 · @cndiv' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          '全国五级行政区划代码，1980–2023 历年版本，一条命令装到本地 SQLite。',
      },
    ],
    ['meta', { property: 'og:url', content: `${siteUrl}/` }],
    ['meta', { property: 'og:image', content: `${siteUrl}/og.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: '全国行政区划代码 · @cndiv' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          '全国五级行政区划代码，1980–2023 历年版本，一条命令装到本地 SQLite。',
      },
    ],
    ['meta', { name: 'twitter:image', content: `${siteUrl}/og.png` }],
    ['link', { rel: 'canonical', href: `${siteUrl}/` }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    outline: { level: [2, 3], label: '本页目录' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    nav: [
      ...(homeUrl ? [{ text: '时光机', link: homeUrl }] : []),
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API', link: '/reference/core' },
      {
        text: '数据',
        items: [
          { text: '历年区划变化', link: '/data/history' },
          { text: '历年快照与下载', link: '/data/snapshots' },
        ],
      },
      { text: '贡献者', link: '/contributors/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速上手', link: '/guide/getting-started' },
            { text: '常见用法', link: '/guide/recipes' },
            { text: '在代码中使用', link: '/guide/usage' },
            { text: '术语表', link: '/guide/glossary' },
            { text: '项目背景', link: '/guide/background' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'API',
          items: [
            { text: '@cndiv/core', link: '/reference/core' },
            { text: '@cndiv/reader', link: '/reference/reader' },
            { text: '@cndiv/cli', link: '/reference/cli' },
            { text: '@cndiv/data-protocol', link: '/reference/data-protocol' },
          ],
        },
        {
          text: '数据怎么存',
          items: [
            { text: '区划码与表结构', link: '/reference/data-model' },
            { text: 'SQLite 数据字典', link: '/reference/data-dictionary' },
          ],
        },
      ],
      '/data/': [
        {
          text: '数据',
          items: [
            { text: '历年区划变化', link: '/data/history' },
            { text: '历年快照与下载', link: '/data/snapshots' },
            { text: 'SQLite 数据字典', link: '/reference/data-dictionary' },
          ],
        },
      ],
      '/contributors/': contributorSidebar,
      '/ops/': contributorSidebar,
    },

    socialLinks: [{ icon: 'github', link: REPO }],

    editLink: {
      pattern: `${REPO}/edit/master/docs-site/:path`,
      text: '在 GitHub 上编辑此页',
    },

    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdatedText: '最后更新',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '外观',

    footer: {
      message:
        '数据来源于公开政府网站（国家统计局、民政部国家地名信息库），仅供学习与研究使用。代码以 MIT 许可。',
      copyright: `MIT Licensed · <a href="${REPO}">tonyc726/china-administrative-division</a>`,
    },
  },
});
