# @cndiv/web SSG 预渲染设计文档

**日期：** 2026-07-16
**作者：** Jiangfeng
**状态：** 待评审

## 一、背景与问题

### 1.1 现状

@cndiv/web 是「中国行政区划时光机」的展示型前端应用，采用 Vite + React 构建，当前为纯 CSR（客户端渲染）架构。

### 1.2 问题

部署到 GitHub Pages 后，静态 `index.html` 仅包含约 1KB 的空壳代码，导致：

| 场景 | 问题描述 | 业务影响 |
|------|----------|----------|
| 搜索引擎爬虫 | Google/Baidu 只看到标题和空 `div#root`，看不到正文内容 | SEO 收录为零，核心关键词无排名 |
| 社交分享抓取 | 微信/Twitter/Facebook 抓取时只读取静态 meta 标签 | 分享预览无实际内容，点击率低 |
| 首屏性能 | 慢网用户先白屏 1-2 秒，等待 JS 下载和 JSON fetch | 用户体验差，跳出率高 |
| CDN 缓存效率 | CDN 只能缓存空 HTML 骨架，真正内容在 JS 中 | GEO 加速效果有限 |

### 1.3 目标

**首要目标：** SEO 搜索引擎完整收录，让「中国行政区划」「县改区」等核心关键词获得排名

**次要目标：**
1. 社交分享卡片显示完整的预览内容
2. 首屏加载速度提升 70% 以上
3. 完全兼容现有 GitHub Pages / Cloudflare 部署
4. 构建时长增加不超过 3 秒

## 二、技术方案选择

### 2.1 方案对比

| 方案 | 技术 | 改动量 | 构建时长 | SEO 效果 | 社交分享 | 灵活性 |
|------|------|--------|----------|----------|----------|--------|
| **A（选中）** | `vite-plugin-ssr` + 零路由预渲染 | 中 | +1-2s | ✅ 最优 | ✅ 完美 | ✅ 未来可扩展动态路由 |
| B | `vite-plugin-prerender` (Puppeteer) | 小 | +2-5s | ⚠️ 水合闪烁 | ⚠️ 不稳定 | ❌ 仅"截图式" |
| C | 手工 `ReactDOMServer.renderToString` | 大 | +1s | ✅ 最优 | ✅ 完美 | ⚠️ 双构建逻辑 |

### 2.2 选择理由

**为什么选 vite-plugin-ssr：**

1. **生产级质量** — Vite 生态最成熟的 SSR/SSG 插件，维护活跃
2. **同构友好** — 同一份 React 组件同时用于服务端渲染和客户端水合
3. **精细控制** — 可精确决定预渲染哪些数据，懒加载哪些数据
4. **无运行时依赖** — 预渲染产物是纯静态 HTML，无需 Node.js 服务端
5. **路径兼容** — 完美适配 GitHub Pages 子路径 (`/china-administrative-division/`)

## 三、详细设计

### 3.1 架构设计

**当前架构（CSR）：**

```
vite build → index.html (1KB 空壳) + JS/CSS assets
  ↓
浏览器加载 HTML
  ↓
下载并执行 JS
  ↓
fetch 4 个 JSON 文件
  ↓
React 渲染内容
  ↓
用户看到首屏（约 1.8-3 秒）
```

**新架构（SSG 预渲染）：**

```
vite build
  ↓
vite-plugin-ssr 执行 prerender()
  ↓
读取 data/timeline.json + data/stats.json
  ↓
ReactDOMServer.renderToString(<App />)
  ↓
注入完整 HTML + 内联数据脚本
  ↓
输出 dist/index.html (约 35KB 完整内容)
  ↓
浏览器加载 → 立刻看到首屏（约 400ms）
  ↓
JS 在后台安静水合，交互功能激活
```

### 3.2 数据加载策略（方案 A：核心数据内联）

**预渲染时内联（SEO 关键路径）：**

| 文件 | 大小 | 理由 |
|------|------|------|
| `timeline.json` | ~32KB | Hero 动画 + 时间线图表数据，首屏核心内容 |
| `stats.json` | ~120B | 五级行政区划统计数字，首屏可见 |

**客户端懒加载（非 SEO 路径）：**

| 文件 | 大小 | 理由 |
|------|------|------|
| `names.json` | ~17KB | 名字环图表，第二屏内容 |
| `geo.json` | ~67KB | 南北分布地图，第三屏内容 |
| `tree.json` | ~229KB | 搜索索引，按需加载 |
| `search/*.json` | 分片 | 搜索结果，用户输入后加载 |
| `wiki/province.json`、`wiki/city.json` | <100KB | 省/市级百科摘要，展开信息面板时加载（见 `2026-07-18-place-info-panel-design.md`） |
| `wiki/county.json` | ~4-5MB | 县级百科摘要，展开面板时按需 fetch |
| `coords/upper.json` | <30KB | 省/市坐标 |
| `coords/shards/*.json` | 单分片 ~8-15KB | 县级及以下坐标，按县级 12 位码按需加载（见 `2026-07-18-dmfw-stname-coords-design.md`） |

> **统一数据加载总表**：内联（`timeline.json` + `stats.json`，SEO 关键路径）与懒加载（上表全部，含信息面板的 `wiki/` + `coords/`）的边界以「是否首屏可见 / 是否 SEO 关键」划分。信息面板（`InfoPanel.tsx`）不参与 SSR 预渲染，其数据一律懒加载。两份规格的懒加载清单以此表为准。

### 3.3 文件变更清单

#### 新增文件

| 文件 | 职责 |
|------|------|
| `apps/web/src/entry-server.tsx` | 服务端渲染入口，调用 `renderToString` |
| `apps/web/src/entry-client.tsx` | 客户端水合入口，调用 `hydrateRoot` |
| `apps/web/src/prerender.ts` | 预渲染数据加载器，构建时读取 JSON |

#### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `apps/web/vite.config.ts` | 加入 `vite-plugin-ssr` 插件配置 |
| `apps/web/src/App.tsx` | 支持 `prerendered` props 传入预加载数据 |
| `apps/web/src/main.tsx` | 改为客户端水合入口 |
| `apps/web/index.html` | 移除硬编码 script 标签，改为 vite-plugin-ssr 管理 |

### 3.4 组件改造设计

**App.tsx 同构兼容：**

```tsx
interface AppProps {
  prerendered?: {
    timeline: TimelineData
    stats: Stats
  }
}

export function App({ prerendered }: AppProps): JSX.Element {
  const [timeline, setTimeline] = useState<TimelineData | null>(
    prerendered?.timeline ?? null
  )
  const [stats, setStats] = useState<Stats | null>(
    prerendered?.stats ?? null
  )

  // 无 prerendered 数据时（开发环境 / 降级），保持原有 fetch 逻辑
  useEffect(() => {
    if (prerendered) return
    // 原有 fetch 逻辑保持不变
  }, [prerendered])

  // ... 其余逻辑不变
}
```

**HTML 内联数据格式：**

```html
<script type="application/json" id="__PRERENDERED_DATA__">
{"timeline": {...}, "stats": {...}}
</script>
```

### 3.5 SEO / 社交标签增强

**新增 Meta 标签：**

| 标签 | 内容 | 目的 |
|------|------|------|
| `og:image` | `WEB_BASE + og-preview.png` | 社交分享预览图（1200×630） |
| `og:image:width` | `1200` | 社交平台正确渲染尺寸 |
| `og:image:height` | `630` | 同上 |
| `twitter:image` | 同上 | Twitter 卡片图片 |
| `rel="canonical"` | 官方 URL | 避免重复内容 |
| `hreflang="zh"` | 中文页面 | 多语言 SEO |
| `hreflang="en"` | 英文页面 | 多语言 SEO |

**新增 JSON-LD 结构化数据：**

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "中国行政区划时光机",
  "description": "1980–2026，652 个「县」从中国的行政区划名册上消失",
  "url": "https://tonyc726.github.io/china-administrative-division"
}
```

### 3.6 构建与部署

**构建命令不变：**

```bash
pnpm build  # apps/web 内执行
```

内部流程变更：

1. `bun scripts/build-data.ts` → 生成 `data/*.json`（不变）
2. `vite build` → vite-plugin-ssr 接管（新增）
   1. 执行 prerender，读取 data/*.json
   2. renderToString 生成 HTML
   3. 注入内联数据和 meta 标签
3. `tsc -b` 类型检查（不变）

**部署配置不变：**

- GitHub Actions `pages.yml` 无需任何改动
- 输出结构完全兼容 GitHub Pages
- `WEB_BASE` 环境变量继续生效

## 四、性能指标预期

| 指标 | 当前 CSR | SSG 目标 | 提升 |
|------|----------|----------|------|
| First Contentful Paint | ~1800ms | ≤400ms | **78%** |
| Largest Contentful Paint | ~2500ms | ≤600ms | **76%** |
| Time to Interactive | ~3200ms | ≤1500ms | **53%** |
| 爬虫可见文本 | ~50 字 | ~1500 字 | **3000%** |
| 构建时长增加 | - | ≤3s | - |

## 五、降级与回滚策略

### 5.1 安全网设计

1. **分支隔离** — 所有改动在独立分支 `feat/web-ssg` 进行，不影响 master
2. **组件兼容** — `App.tsx` 始终支持无 `prerendered` props 的 CSR 模式
3. **一键回滚** — 如果 SSG 出问题，只需：
   ```bash
   # 移除 vite-plugin-ssr，恢复原有 vite.config.ts
   git checkout apps/web/vite.config.ts
   ```
4. **开发环境默认 CSR** — 开发时保持纯 CSR 模式，不增加开发复杂度

### 5.2 验证清单

发布前必须验证：

- [ ] `view-source:` 查看 HTML，包含完整的首屏文案和数字
- [ ] Google 富结果测试工具（https://search.google.com/test/rich-results）能正确解析
- [ ] Twitter Card 验证器显示正确的预览
- [ ] 切换语言功能正常（水合成功）
- [ ] 搜索功能正常（懒加载数据成功）
- [ ] GitHub Pages 子路径下所有资源加载正常
- [ ] Cloudflare 根路径下所有资源加载正常

## 六、实施步骤

（详见后续的 implementation plan）

---

**变更日志：**
- 2026-07-16: 初稿完成
