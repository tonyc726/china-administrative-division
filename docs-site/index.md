---
layout: home

hero:
  name: 中国行政区划数据基础设施
  text: 后统计局时代的可持续更新方案
  tagline: GB2260 国标（省/市/县，1980–2023）＋ NBS 统计用区划代码五级（省/市/县/乡/村，2009–2023）历年快照。2023 基线 ＋ 社区 Patch 增量 ＋ 多源合成，数据与代码彻底解耦。
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: 为什么是 v2
      link: /guide/why-v2
    - theme: alt
      text: 在 GitHub 查看
      link: https://github.com/tonyc726/china-administrative-division

features:
  - title: 2023 全量基线快照
    details: 国家统计局 stats.gov.cn 自 2024 年停更、2026 转向国家地名信息库。v2 以 2023 五级全量为不可变基线，村级 620,572 条冻结留档。
    link: /data/snapshots
    linkText: 下载历年快照
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  - title: 社区 Patch 增量
    details: 撤县设区、更名、新设社区等变更以 JSON Patch 提交，validatePatch 结构性门禁 ＋ CI 自动校验，逐年可追溯、可回放。
    link: /guide/contributing-patch
    linkText: 贡献 Patch
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
  - title: 用户侧零爬虫
    details: cndiv hydrate 从 NPM 拉取数据包注水到本地 SQLite，标准 SQLite 可直接 SQL 查询，大数据不进 git。
    link: /guide/getting-started
    linkText: CLI 注水
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  - title: 纯函数码工具
    details: "@cndiv/core 零依赖：校验、解析 12 位区划码（2＋2＋2＋3＋3），判级、取父码、补零。TS 严格类型，浏览器 / Node / 边缘皆可跑。"
    link: /reference/core
    linkText: 码工具 API
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 00-2 2v5a2 2 0 002 2h1"/><path d="M16 21h1a2 2 0 002-2v-5a2 2 0 00-2-2h-1"/><path d="M8 21H7a2 2 0 01-2-2v-5c0-1.1.9-2 2-2h1"/><path d="M16 3h1a2 2 0 012 2v5c0 1.1-.9 2-2 2h-1"/></svg>
  - title: 只读查询 API
    details: "@cndiv/reader 薄封装 better-sqlite3，自动屏蔽复合主键 (code, year) 与直辖市「市辖区」占位层两个坑。"
    link: /reference/reader
    linkText: 查询 API
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  - title: 增量采集引擎
    details: "@cndiv/crawler 对接国家地名信息库（dmfw）逐层 BFS 采集，canonicalizeParent 归一化占位层消解假 move，差分产出 Patch。"
    link: /reference/crawler
    linkText: 采集引擎
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 010 20 14.5 14.5 0 010-20"/><path d="M2 12h20"/></svg>
---

## 三行上手

```bash
npm i -g @cndiv/cli
cndiv hydrate --year=2023          # 下载 @cndiv/source-2023 → ~/.cndiv/cache.db
cndiv export --year=2023 --output=divisions-2023.csv
```

在代码里查询：

```ts
import { openCache } from '@cndiv/reader';

const cn = openCache();                    // 默认 ~/.cndiv/cache.db，只读
cn.findByCode('110101000000', 2023);       // → 东城区
cn.getChildren('110000000000', 2023, { skipPlaceholder: true }); // → [东城区, 西城区, ...]
cn.close();
```

## 数据规模一览

<LevelScaleChart />

## 它解决什么

> 原数据源国家统计局 `stats.gov.cn`（统计用区划代码和城乡划分代码）自 **2024 年起停止公开发布**、**2026 年起统一转向「国家地名信息库」**（dmfw.mca.gov.cn），全量五级数据已无官方活源。

v2 架构从「镜像一个源」转为 **「2023 基线快照 ＋ 社区 Patch 增量 ＋ 多源合成」**，并把数据与代码彻底解耦：

```
构建期(维护者)                     分发                用户运行期
历史源/dmfw/镜像 → 合成 → SQLite → NPM @cndiv/source-YYYY → cndiv hydrate → ~/.cndiv/cache.db
                                  + GitHub Release 归档        + patches/*.json  → cndiv apply-patch
```

详见 [为什么是 v2](/guide/why-v2)。
