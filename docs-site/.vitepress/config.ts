import { defineConfig } from 'vitepress';

// 多平台部署：GitHub Pages 需要 /<repo>/ 前缀，Vercel/Netlify/Cloudflare 用根路径 /。
// 部署时用 DOCS_BASE 覆盖，例如 GH Pages: DOCS_BASE=/china-administrative-division/
const base = process.env.DOCS_BASE ?? '/';

// OG/分享图与 canonical 需要绝对 URL。默认 GH Pages 地址（含项目名路径，与 DOCS_BASE 对应）；
// 部署到 Cloudflare/Vercel/Netlify 根域时用 DOCS_SITE_URL 覆盖（同时把 DOCS_BASE 设回 /）。
const siteUrl = (process.env.DOCS_SITE_URL ?? 'https://tonyc726.github.io/china-administrative-division').replace(/\/$/, '');

const REPO = 'https://github.com/tonyc726/china-administrative-division';

export default defineConfig({
  lang: 'zh-CN',
  title: '中国行政区划数据基础设施',
  description:
    '中华人民共和国行政区划代码的历史数据库与可持续更新基础设施 · GB2260(1980–2023) + NBS 统计用区划代码五级(2009–2023) 历年快照 · 后统计局时代的社区 Patch 增量方案',
  base,

  // 首轮全量迁移：包 README / docs 设计稿含大量跨包与 examples 相对链接，
  // 经 @include 拼接后无法在站点内解析。先放开死链检查，后续按页收敛为绝对/站内链。
  ignoreDeadLinks: true,

  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,

  head: [
    ['meta', { name: 'keywords', content: '中国行政区划,行政区划代码,GB2260,统计用区划代码,NBS,城乡划分代码,国家地名信息库,dmfw,邮编,区号,SQLite,行政区划历史数据' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '中国行政区划数据基础设施 · @cndiv' }],
    ['meta', { property: 'og:description', content: 'stats.gov.cn 停更后的替代方案：2023 基线快照 + 社区 Patch 增量 + 多源合成。历年版本化，数据与代码解耦。' }],
    ['meta', { property: 'og:url', content: `${siteUrl}/` }],
    ['meta', { property: 'og:image', content: `${siteUrl}/og.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: '中国行政区划数据基础设施 · @cndiv' }],
    ['meta', { name: 'twitter:description', content: 'stats.gov.cn 停更后的替代方案：2023 基线 + 社区 Patch 增量 + 多源合成。' }],
    ['meta', { name: 'twitter:image', content: `${siteUrl}/og.png` }],
    ['link', { rel: 'canonical', href: `${siteUrl}/` }],
  ],

  themeConfig: {
    logo: undefined,
    outline: { level: [2, 3], label: '本页目录' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    nav: [
      { text: '指南', link: '/guide/why-v2' },
      { text: '包参考', link: '/reference/core' },
      { text: '数据下载', link: '/data/snapshots' },
      { text: '运维/架构', link: '/ops/architecture' },
      {
        text: 'v2.0.0',
        items: [
          { text: '发布指南', link: '/reference/publishing' },
          { text: 'Changesets', link: `${REPO}/tree/master/.changeset` },
          { text: 'npm @cndiv', link: 'https://www.npmjs.com/org/cndiv' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '为什么是 v2', link: '/guide/why-v2' },
            { text: '快速上手', link: '/guide/getting-started' },
            { text: '在代码中使用', link: '/guide/usage' },
            { text: '贡献 Patch', link: '/guide/contributing-patch' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '面向消费者的包',
          items: [
            { text: '@cndiv/core · 码工具', link: '/reference/core' },
            { text: '@cndiv/data-protocol · 协议', link: '/reference/data-protocol' },
            { text: '@cndiv/cli · 命令行', link: '/reference/cli' },
            { text: '@cndiv/reader · 只读查询', link: '/reference/reader' },
          ],
        },
        {
          text: '维护者的包',
          items: [
            { text: '@cndiv/crawler · 增量采集', link: '/reference/crawler' },
            { text: '@cndiv/extractor · 公告抽取', link: '/reference/extractor' },
          ],
        },
        {
          text: '数据模型',
          items: [
            { text: '区划码结构与数据模型', link: '/reference/data-model' },
            { text: '发布指南（npm）', link: '/reference/publishing' },
          ],
        },
      ],
      '/data/': [
        {
          text: '数据资产',
          items: [
            { text: '历年快照与下载', link: '/data/snapshots' },
          ],
        },
      ],
      '/ops/': [
        {
          text: '架构',
          items: [
            { text: '下一代基础设施架构设计', link: '/ops/architecture' },
          ],
        },
        {
          text: '采集运维',
          items: [
            { text: '采集运维手册', link: '/ops/crawl-runbook' },
            { text: '采集现状评估与提升路径', link: '/ops/collection-assessment' },
            { text: 'Patch 校验与交叉校验', link: '/ops/patch-verify' },
          ],
        },
        {
          text: '编制规则（参考）',
          items: [
            { text: '统计用区划代码编制规则', link: '/ops/rule-nbs' },
            { text: '县以下区划代码编制规则', link: '/ops/rule-sub-county' },
          ],
        },
      ],
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
      message: '数据来源于公开政府网站（国家统计局、民政部国家地名信息库），仅供学习与研究使用。代码以 MIT 许可。',
      copyright: `MIT Licensed · <a href="${REPO}">tonyc726/china-administrative-division</a>`,
    },
  },
});
