# docs-site · @cndiv 文档站

VitePress 静态文档站，用于对外推广与集成参考。

## 设计约束

- **独立于 monorepo workspace**：根仓 `packages/*` 才是主 workspace 成员。本目录是嵌套 workspace（自有 `pnpm-workspace.yaml`），`pnpm install` 会把 VitePress（Vite 5）的依赖树与主仓（Vite 8）的 lockfile / `tsc -b` 完全隔离。不要加 `--ignore-workspace`：pnpm 11 会因此忽略 `allowBuilds`，esbuild 的 install 脚本无法放行。
- **用户页自己写，包 README 留给 npm**：`reference/` 里 core、reader、cli、data-protocol 是给第一次使用者的短页（安装、函数表、一段例子），不要再 `@include` 整份包 README。包 README 仍是 npm 页面的原文，改 API 时两处一起改。
- **维护者页继续 `@include`**：`contributors/crawler.md`、`contributors/extractor.md`、`contributors/publishing.md` 和 `ops/`、`data/snapshots.md` 直接引用 `packages/*/README.md` 或 `docs/*.md`。改那些长文改源文件即可。
- **多平台可部署**：`base` 由环境变量 `DOCS_BASE` 控制——GitHub Pages 用 `/china-administrative-division/`，Vercel/Netlify/Cloudflare 用根 `/`（默认）。

## 本地开发

```bash
cd docs-site
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # 产物 → .vitepress/dist
pnpm preview    # 预览构建产物
```

## 部署

### GitHub Pages（已配置，开箱即用）

`.github/workflows/docs.yml` 已就绪：push 到 `master` 且 `docs-site/**`、`packages/*/README.md`、`docs/**` 变更即自动构建部署。

一次性开启：仓库 **Settings → Pages → Source 选 "GitHub Actions"** 即可。站点地址 `https://tonyc726.github.io/china-administrative-division/`。

### Cloudflare Pages（推荐，国内访问优）

Dashboard → Pages → Connect Git，构建设置：

| 项 | 值 |
|---|---|
| Root directory | `docs-site` |
| Build command | `pnpm install && pnpm build` |
| Build output directory | `.vitepress/dist` |
| Environment variable | `NODE_VERSION=22` |

`base` 用默认根路径 `/`，无需设 `DOCS_BASE`。

### Vercel

导入仓库后：**Root Directory 设 `docs-site`**，其余由 `docs-site/vercel.json` 接管（`buildCommand` / `outputDirectory` 已写好）。

### Netlify

导入仓库后：**Base directory 设 `docs-site`**，其余由 `docs-site/netlify.toml` 接管。

## 目录

```
docs-site/
  .vitepress/config.ts     # 导航/侧边栏/搜索/base
  index.md                 # Landing
  guide/                   # 快速上手 / 常见用法 / 在代码中使用 / 术语表 / 项目背景
  reference/               # 四个用户包的短页 + 区划码 / 数据字典
  contributors/            # 贡献 Patch、发布、crawler、extractor
  data/snapshots.md        # @include docs/DATA-ASSETS.md
  ops/                     # 架构 / 运维 / 编制规则（@include docs/*.md，侧栏归在贡献者）
```

> `docs/` 下的内部规划稿（项目重构方案 / 改造实施计划 / 采集优化清单 / 采集能力提升实施计划 / spike 等）已归档至 `docs/history/`，未纳入站点导航，保留供考古。如需上站，在 `ops/` 加对应 `@include` 页（路径 `../../docs/history/<file>.md`）并补进 `config.ts` sidebar。

## 待收敛（TODO）

- `ignoreDeadLinks` 只放过 `@include` 原文里的 `./`、`../` 相对链接（那些链接是给 GitHub 上的 `docs/` 和包 README 用的）。`/guide`、`/reference` 这类站内路径仍然检查，写错会构建失败。

## OG 分享图

`public/og.png`（1200×630）已就位，`config.ts` head 已接 `og:image` / `twitter:card`。图的绝对 URL 由 `siteUrl`（`DOCS_SITE_URL` 覆盖，默认 GH Pages 地址）拼出。
换域名时：设 `DOCS_SITE_URL=https://你的域名` 且 `DOCS_BASE=/` 一起构建即可。
重制图源：`scratchpad/og.html`（本地 `python3 -m http.server` 后浏览器截 1200×630）。
