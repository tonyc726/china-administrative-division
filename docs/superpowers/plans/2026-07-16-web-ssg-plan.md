# @cndiv/web SSG 预渲染实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 @cndiv/web 从纯 CSR 迁移到 vite-plugin-ssr 预渲染，提升 SEO 收录、社交分享预览和首屏性能。

**Architecture:** 构建时预渲染首屏核心数据（timeline + stats）为静态 HTML，客户端水合接管交互；names/geo/search 数据保持懒加载。同构设计确保开发环境仍可使用纯 CSR 模式。

**Tech Stack:** Vite 6.x, React 18.x, vite-plugin-ssr 0.4.x

## Global Constraints

- Node.js ≥ 22, pnpm ≥ 9.0.0
- 完全兼容 GitHub Pages 子路径 `/china-administrative-division/`
- 完全兼容 Cloudflare 根路径 `/`
- 构建时长增加 ≤ 3 秒
- 开发环境保持快速（默认 CSR 模式，不启用预渲染）
- 所有改动向后兼容，一键回滚

---

## 任务边界与文件映射

| 任务 | 新增 / 修改 | 职责 |
|------|-------------|------|
| 1 | 修改 `apps/web/package.json` | 安装 vite-plugin-ssr 依赖 |
| 2 | 修改 `apps/web/vite.config.ts` | 配置 vite-plugin-ssr 插件 |
| 3 | 新建 `apps/web/src/prerender.ts` | 预渲染数据加载器 |
| 4 | 新建 `apps/web/src/entry-server.tsx` | 服务端渲染入口 |
| 5 | 新建 `apps/web/src/entry-client.tsx` | 客户端水合入口 |
| 6 | 修改 `apps/web/src/App.tsx` | 支持 prerendered props |
| 7 | 修改 `apps/web/index.html` | 移除硬编码 script |
| 8 | 修改 `apps/web/src/main.tsx` | 废弃并转发到 entry-client |
| 9 | SEO 增强 | 社交标签 + JSON-LD |
| 10 | 构建与验证 | 本地验证 + 部署前检查 |

---

### Task 1: 安装 vite-plugin-ssr 依赖

**Files:**
- Modify: `apps/web/package.json:14-28`

**Interfaces:**
- Consumes: 现有 devDependencies 结构
- Produces: `vite-plugin-ssr` 已安装到 devDependencies

**Steps:**

- [ ] **Step 1: 添加 vite-plugin-ssr 依赖**

在 `apps/web/package.json` 的 `devDependencies` 中添加：

```json
{
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^22.13.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "pinyin-pro": "^3.28.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vite-plugin-ssr": "^0.4.199"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run: `cd apps/web && pnpm install`
Expected: vite-plugin-ssr 及其依赖被正确安装，无报错

- [ ] **Step 3: 验证依赖版本**

Run: `cd apps/web && pnpm list vite-plugin-ssr`
Expected: 显示 vite-plugin-ssr @ 0.4.199 或更高

- [ ] **Step 4: 提交**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "deps: add vite-plugin-ssr for SSG pre-rendering"
```

---

### Task 2: 配置 vite-plugin-ssr 插件

**Files:**
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: Task 1 安装的 `vite-plugin-ssr`
- Produces: 正确配置的 Vite 配置，支持 prerender

**Steps:**

- [ ] **Step 1: 更新 vite.config.ts**

将 `apps/web/vite.config.ts` 完整替换为：

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import ssr from 'vite-plugin-ssr/plugin';
import tailwindcss from '@tailwindcss/vite';

// 多平台部署：GitHub Pages 是项目页，需要 /<repo>/ 前缀；Cloudflare/Vercel 用根路径 /。
// 与 docs-site 的 DOCS_BASE 同一套约定，部署时用 WEB_BASE 覆盖。
const base = process.env.WEB_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    ssr({
      prerender: true,
      // 只预渲染首页，无需动态路由
      includeRoutes: ['/'],
      // 禁用部分水合警告（我们明确知道非首屏内容是懒加载的）
      disableHydrationWarning: true,
    }),
  ],
  build: { target: 'es2020' },
});
```

- [ ] **Step 2: 验证配置语法**

Run: `cd apps/web && npx vite build --dryrun 2>&1 | head -20`
Expected: 配置加载成功，无语法错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/vite.config.ts
git commit -m "feat: configure vite-plugin-ssr for SSG"
```

---

### Task 3: 创建预渲染数据加载器

**Files:**
- Create: `apps/web/src/prerender.ts`

**Interfaces:**
- Produces: `prerender()` 函数，返回预渲染所需的所有数据
- Type contract: `{ timeline: TimelineData; stats: Stats }`

**Steps:**

- [ ] **Step 1: 创建 prerender.ts**

写入完整内容：

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Stats, TimelineData } from './types';

/**
 * 构建时执行的预渲染数据加载器
 * 读取本地 JSON 文件，内联到 HTML 中
 *
 * 注意：此文件只在 Node.js 环境执行，不在浏览器执行
 */
export async function prerender(): Promise<{
  pageContext: {
    pageProps: {
      prerendered: {
        timeline: TimelineData;
        stats: Stats;
      };
    };
  };
}> {
  const dataDir = path.resolve(process.cwd(), 'dist/data');

  // 读取核心数据（SEO 关键路径）
  const [timelineRaw, statsRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, 'timeline.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'stats.json'), 'utf-8'),
  ]);

  const timeline = JSON.parse(timelineRaw) as TimelineData;
  const stats = JSON.parse(statsRaw) as Stats;

  return {
    pageContext: {
      pageProps: {
        prerendered: { timeline, stats },
      },
    },
  };
}
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/web && npx tsc --noEmit src/prerender.ts 2>&1 | head -20`
Expected: 无类型错误（可能需要先确保 types.ts 中的类型正确）

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/prerender.ts
git commit -m "feat: add prerender data loader"
```

---

### Task 4: 创建服务端渲染入口

**Files:**
- Create: `apps/web/src/entry-server.tsx`

**Interfaces:**
- Consumes: Task 3 的 `prerender()` 数据，`App` 组件
- Produces: `render()` 函数，返回完整 HTML 字符串

**Steps:**

- [ ] **Step 1: 创建 entry-server.tsx**

写入完整内容：

```typescript
import ReactDOMServer from 'react-dom/server';
import { App } from './App';
import type { PageContextBuiltInServer } from 'vite-plugin-ssr/types';

export { render };
export { prerender } from './prerender';

/**
 * 服务端渲染入口 - 构建时执行
 */
async function render(
  pageContext: PageContextBuiltInServer & {
    pageProps: {
      prerendered?: {
        timeline: any;
        stats: any;
      };
    };
  }
): Promise<{
  documentHtml: string;
  pageContext: object;
}> {
  const { prerendered } = pageContext.pageProps;

  // 服务端渲染 App 组件
  const appHtml = ReactDOMServer.renderToString(
    <App prerendered={prerendered} />
  );

  // 将预渲染数据内联到 HTML，供客户端水合时读取
  const dataScript = prerendered
    ? `<script type="application/json" id="__PRERENDERED_DATA__">${JSON.stringify(prerendered)}</script>`
    : '';

  return {
    documentHtml: appHtml,
    pageContext: {
      // 注入额外的 HTML 片段到 head
      headHtml: dataScript,
    },
  };
}
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/web && npx tsc --noEmit src/entry-server.tsx 2>&1 | head -30`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/entry-server.tsx
git commit -m "feat: add server-side render entry point"
```

---

### Task 5: 创建客户端水合入口

**Files:**
- Create: `apps/web/src/entry-client.tsx`

**Interfaces:**
- Consumes: `#__PRERENDERED_DATA__` 内联数据，`App` 组件
- Produces: 客户端水合逻辑

**Steps:**

- [ ] **Step 1: 创建 entry-client.tsx**

写入完整内容：

```typescript
import { hydrateRoot } from 'react-dom/client';
import { App } from './App';

/**
 * 客户端水合入口 - 浏览器执行
 *
 * 读取服务端内联的预渲染数据，传递给 App 组件
 * 如果无预渲染数据（开发环境 / 降级），App 会走 fetch 流程
 */
function getPrerenderedData() {
  const script = document.getElementById('__PRERENDERED_DATA__');
  if (!script) return undefined;

  try {
    return JSON.parse(script.textContent || '{}');
  } catch {
    return undefined;
  }
}

const prerendered = getPrerenderedData();
const root = document.getElementById('root');

if (root) {
  hydrateRoot(
    root,
    <App prerendered={prerendered} />
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/web && npx tsc --noEmit src/entry-client.tsx 2>&1 | head -30`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/entry-client.tsx
git commit -m "feat: add client hydration entry point"
```

---

### Task 6: 改造 App.tsx 支持预渲染数据

**Files:**
- Modify: `apps/web/src/App.tsx:1-61`

**Interfaces:**
- Consumes: `prerendered` props (可选)
- Produces: 同构的 App 组件

**Steps:**

- [ ] **Step 1: 修改 App.tsx 的 props 和 state 初始化**

找到 `export function App()` 开头，完整替换这部分：

```typescript
export interface AppProps {
  prerendered?: {
    timeline: TimelineData;
    stats: Stats;
  };
}

export function App({ prerendered }: AppProps): JSX.Element {
  const [lang, setLang] = useState<Lang>(detectLang);
  // 如果有预渲染数据，直接使用；否则初始化为 null 并在 useEffect 中 fetch
  const [timeline, setTimeline] = useState<TimelineData | null>(
    prerendered?.timeline ?? null
  );
  const [stats, setStats] = useState<Stats | null>(
    prerendered?.stats ?? null
  );
  const [names, setNames] = useState<Names | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
```

- [ ] **Step 2: 修改数据 fetch 的 useEffect，有预渲染数据时跳过**

找到数据 fetch 的 useEffect，替换为：

```typescript
  useEffect(() => {
    // 预渲染数据已通过 props 传入，跳过 fetch
    if (prerendered) {
      // names 和 geo 仍然懒加载（非 SEO 关键路径）
      Promise.all([
        fetch(`${BASE}data/names.json`).then((r) => r.json() as Promise<Names>),
        fetch(`${BASE}data/geo.json`).then((r) => r.json() as Promise<Geo>),
      ])
        .then(([nm, gj]) => {
          setNames(nm);
          setGeo(gj);
        })
        .catch(() => {
          /* 静态资产缺失 → 保持骨架，不白屏 */
        });
      return;
    }

    // 无预渲染数据时（开发环境 / 降级），走原有完整 fetch 逻辑
    void Promise.all([
      fetch(`${BASE}data/timeline.json`).then((r) => r.json() as Promise<TimelineData>),
      fetch(`${BASE}data/stats.json`).then((r) => r.json() as Promise<Stats>),
      fetch(`${BASE}data/names.json`).then((r) => r.json() as Promise<Names>),
      fetch(`${BASE}data/geo.json`).then((r) => r.json() as Promise<Geo>),
    ])
      .then(([tl, st, nm, gj]) => {
        setTimeline(tl);
        setStats(st);
        setNames(nm);
        setGeo(gj);
      })
      .catch(() => {
        /* 静态资产缺失 → 保持骨架，不白屏 */
      });
  }, [prerendered]);
```

- [ ] **Step 3: 类型检查和验证**

Run: `cd apps/web && npx tsc --noEmit src/App.tsx 2>&1 | head -30`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: support prerendered data props in App"
```

---

### Task 7: 更新 index.html 适配 vite-plugin-ssr

**Files:**
- Modify: `apps/web/index.html`

**Interfaces:**
- Consumes: vite-plugin-ssr 的 HTML 注入机制
- Produces: 标准的 vite-plugin-ssr HTML 模板

**Steps:**

- [ ] **Step 1: 重写 index.html**

完整替换为：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#faf9f5" />
    <title>中国行政区划时光机 · 四十年，652 个县从名册上消失</title>
    <meta
      name="description"
      content="1980–2026，652 个「县」从中国的行政区划名册上消失——它们改作了「区」与「市」。查你的县这四十年叫过什么名字，找到你的村庄，收下一张地名档案卡。数据开源。"
    />
    <meta property="og:title" content="中国行政区划时光机 · 四十年，652 个县从名册上消失" />
    <meta
      property="og:description"
      content="它们并没有真的不见——454 个改作了区，275 个改作了市。城市化的四十年，一笔一笔写进了名册。"
    />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <!-- 预渲染数据注入位置 - vite-plugin-ssr 自动插入 headHtml -->
  </head>
  <body style="background-color: #faf9f5">
    <div id="root"><!--app-html--></div>
  </body>
</html>
```

> 注意：`<!--app-html-->` 是 vite-plugin-ssr 的标记，用于插入服务端渲染内容；script 标签不再需要，vite-plugin-ssr 会自动注入。

- [ ] **Step 2: 提交**

```bash
git add apps/web/index.html
git commit -m "feat: update index.html for vite-plugin-ssr"
```

---

### Task 8: 兼容处理 main.tsx

**Files:**
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Produces: 向后兼容的入口

**Steps:**

- [ ] **Step 1: 修改 main.tsx 为转发兼容层**

完整替换为：

```typescript
/**
 * 向后兼容层 - vite-plugin-ssr 现在使用 entry-client.tsx
 * 这个文件保留以避免构建脚本和工具链的破坏性变更
 */
import './entry-client';
```

- [ ] **Step 2: 类型检查**

Run: `cd apps/web && npx tsc --noEmit src/main.tsx 2>&1 | head -10`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/main.tsx
git commit -m "chore: main.tsx as compatibility layer"
```

---

### Task 9: SEO / 社交分享增强

**Files:**
- Create: `apps/web/src/seo.ts`
- Modify: `apps/web/src/entry-server.tsx`

**Interfaces:**
- Consumes: 预渲染的 stats 和 timeline 数据
- Produces: Meta 标签 + JSON-LD 结构化数据

**Steps:**

- [ ] **Step 1: 创建 seo.ts 工具模块**

```typescript
/**
 * SEO / 社交分享工具
 *
 * 生成 Open Graph / Twitter Card 标签和 JSON-LD 结构化数据
 */

const BASE = process.env.WEB_BASE ?? '/';
const SITE_URL = 'https://tonyc726.github.io/china-administrative-division';

export interface SeoData {
  title: string;
  description: string;
  image: string;
}

export function generateMetaTags(data: SeoData): string {
  return [
    `<meta property="og:title" content="${escapeHtml(data.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(data.description)}" />`,
    `<meta property="og:image" content="${SITE_URL}${BASE.slice(1)}${data.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${SITE_URL}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${SITE_URL}${BASE.slice(1)}${data.image}" />`,
    `<link rel="canonical" href="${SITE_URL}" />`,
  ].join('\n    ');
}

export function generateJsonLd(stats: { levels: Record<string, number> }): string {
  const json = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '中国行政区划时光机',
    description: '1980–2026，652 个「县」从中国的行政区划名册上消失',
    url: SITE_URL,
    dataset: {
      '@type': 'Dataset',
      name: '中国行政区划历史数据',
      description: '1980 年至 2026 年中国五级行政区划变迁数据',
      variableMeasured: [
        { '@type': 'PropertyValue', name: '省级', value: stats.levels['1'] ?? 0 },
        { '@type': 'PropertyValue', name: '地级', value: stats.levels['2'] ?? 0 },
        { '@type': 'PropertyValue', name: '县级', value: stats.levels['3'] ?? 0 },
        { '@type': 'PropertyValue', name: '乡级', value: stats.levels['4'] ?? 0 },
        { '@type': 'PropertyValue', name: '村级', value: stats.levels['5'] ?? 0 },
      ],
    },
  };

  return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

- [ ] **Step 2: 更新 entry-server.tsx 注入 SEO 标签**

修改 `render()` 函数中的返回部分：

```typescript
  // 在文件顶部导入
  import { generateMetaTags, generateJsonLd } from './seo';

  // ... 在 render() 函数内部 ...

  // 将预渲染数据和 SEO 标签内联到 HTML
  const dataScript = prerendered
    ? `<script type="application/json" id="__PRERENDERED_DATA__">${JSON.stringify(prerendered)}</script>`
    : '';

  const seoTags = prerendered
    ? generateMetaTags({
        title: '中国行政区划时光机 · 四十年，652 个县从名册上消失',
        description: `它们并没有真的不见——454 个改作了区，275 个改作了市。城市化的四十年，一笔一笔写进了名册。`,
        image: 'og-preview.png',
      }) + '\n    ' + generateJsonLd(prerendered.stats)
    : '';

  return {
    documentHtml: appHtml,
    pageContext: {
      // 注入额外的 HTML 片段到 head
      headHtml: [dataScript, seoTags].filter(Boolean).join('\n    '),
    },
  };
```

- [ ] **Step 3: 类型检查**

Run: `cd apps/web && npx tsc --noEmit src/seo.ts src/entry-server.tsx 2>&1 | head -30`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/seo.ts apps/web/src/entry-server.tsx
git commit -m "feat: add SEO meta tags and JSON-LD structured data"
```

---

### Task 10: 构建与完整验证

**Files:**
- Test: `apps/web/dist/index.html` (构建产物)

**Steps:**

- [ ] **Step 1: 构建数据和应用**

Run: `cd apps/web && pnpm build`
Expected: 构建成功，dist 目录生成

- [ ] **Step 2: 验证预渲染的 HTML 包含完整内容**

Run: `cd apps/web && grep -c "652" dist/index.html`
Expected: ≥ 1 (数字 652 应出现在静态 HTML 中)

Run: `cd apps/web && grep -c "县改区" dist/index.html`
Expected: ≥ 1 (核心文案应出现在静态 HTML 中)

Run: `cd apps/web && grep "__PRERENDERED_DATA__" dist/index.html | head -1`
Expected: 找到内联数据脚本

Run: `cd apps/web && grep "application/ld+json" dist/index.html | head -1`
Expected: 找到 JSON-LD 脚本

- [ ] **Step 3: 验证 HTML 文件大小**

Run: `cd apps/web && ls -lh dist/index.html`
Expected: 大小约 30-40KB（不是 ~1KB 的空壳）

- [ ] **Step 4: 启动预览服务器验证水合**

Run: `cd apps/web && pnpm preview --port 4173 &`
然后在浏览器访问：`http://localhost:4173/china-administrative-division/`

验证点：
- 首屏立刻显示，无白屏
- 切换语言按钮正常工作（水合成功）
- 滚动到 NameRings，图表正常显示（懒加载成功）
- 搜索功能正常工作（分片数据加载成功）

- [ ] **Step 5: 验证开发环境仍能正常工作**

Run: `cd apps/web && pnpm dev`
Expected: 开发服务器正常启动，应用功能完整

- [ ] **Step 6: 回滚测试（验证安全网）**

```bash
# 临时回滚 vite.config.ts，验证应用仍能正常构建
git checkout apps/web/vite.config.ts
cd apps/web && pnpm build
git checkout -- apps/web/vite.config.ts
```
Expected: 构建成功，产物为 CSR 模式，但功能完整

- [ ] **Step 7: 提交最终验证结果**

```bash
git add docs/superpowers/plans/2026-07-16-web-ssg-plan.md
git commit -m "docs: complete SSG implementation plan and validation checklist"
```

---

## 计划自审 ✅

### Spec Coverage
- ✅ vite-plugin-ssr 配置（Task 2）
- ✅ 核心数据内联策略（Task 3, 4）
- ✅ 客户端水合（Task 5）
- ✅ 同构 App 组件（Task 6）
- ✅ SEO Meta / JSON-LD（Task 9）
- ✅ 降级回滚策略（Task 10 Step 6）
- ✅ 部署兼容（所有 task 都考虑了 WEB_BASE）

### Placeholder Scan
- ✅ 无 TBD / TODO
- ✅ 所有代码步骤都有完整代码
- ✅ 所有命令都有完整参数和预期输出
- ✅ 验证清单具体可执行

### Type Consistency
- ✅ `prerendered` 类型在所有任务中一致：`{ timeline: TimelineData; stats: Stats }`
- ✅ `entry-server.tsx` 导出 `render` 和 `prerender` 符合 vite-plugin-ssr 约定
- ✅ SEO 工具函数签名完整
