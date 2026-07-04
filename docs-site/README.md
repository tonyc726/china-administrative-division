# docs-site · @cndiv 文档站

VitePress 静态文档站，用于对外推广与集成参考。

## 设计约束

- **独立于 monorepo workspace**：`packages/*` 才是 workspace 成员，本目录不是。安装一律用 `--ignore-workspace`，让 VitePress（Vite 5）的依赖树与主仓（Vite 8）的 lockfile / `tsc -b` 完全隔离。
- **单一真相源**：包参考页与运维/规则页用 VitePress `<!--@include-->` 直接引用 `../packages/*/README.md` 与 `../docs/*.md`，站点**不复制**内容，避免两处漂移。改内容改源文件即可。
- **多平台可部署**：`base` 由环境变量 `DOCS_BASE` 控制——GitHub Pages 用 `/china-administrative-division/`，Vercel/Netlify/Cloudflare 用根 `/`（默认）。

## 本地开发

```bash
cd docs-site
pnpm install --ignore-workspace
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
| Build command | `pnpm install --ignore-workspace && pnpm build` |
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
  guide/                   # 指南（why-v2 / getting-started / usage / contributing-patch）
  reference/               # 包参考（@include 各包 README）+ data-model + publishing
  data/snapshots.md        # @include docs/DATA-ASSETS.md
  ops/                     # 架构 / 运维 / 编制规则（@include docs/*.md）
```

> `docs/` 下的内部规划稿（项目重构方案 / 改造实施计划 / 采集优化清单 / spike 等）未纳入站点导航，保留在仓库中供考古。如需上站，在 `ops/` 加对应 `@include` 页并补进 `config.ts` sidebar。

## 待收敛（TODO）

- `config.ts` 暂开 `ignoreDeadLinks: true`：包 README 经 `@include` 拼接后，其中的跨包/`examples` 相对链接无法在站点内解析。后续逐页把这些链接改为站内绝对路径或 GitHub 绝对链接后，可关掉此开关以恢复死链门禁。

## OG 分享图

`public/og.png`（1200×630）已就位，`config.ts` head 已接 `og:image` / `twitter:card`。图的绝对 URL 由 `siteUrl`（`DOCS_SITE_URL` 覆盖，默认 GH Pages 地址）拼出。
换域名时：设 `DOCS_SITE_URL=https://你的域名` 且 `DOCS_BASE=/` 一起构建即可。
重制图源：`scratchpad/og.html`（本地 `python3 -m http.server` 后浏览器截 1200×630）。
