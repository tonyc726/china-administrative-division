<p align="center">
  <img src="./docs-site/public/logo.svg" width="88" height="88" alt="cndiv logo">
</p>

# China Administrative Division

[![Docs](https://img.shields.io/badge/docs-cndiv-brightgreen?logo=vuedotjs)](https://tonyc726.github.io/china-administrative-division/)
[![Validate Patches](https://github.com/tonyc726/china-administrative-division/actions/workflows/validate-patches.yml/badge.svg)](https://github.com/tonyc726/china-administrative-division/actions/workflows/validate-patches.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

中华人民共和国行政区划代码的历史数据库，以及一套持续更新它的基础设施。

覆盖 **1980--2026** 年，省 / 市 / 县 / 乡镇 / 村五级。原始数据源国家统计局 `stats.gov.cn` 自 2024 年起停更，v2 改为 **2023 基线快照 + 民政部法令推演 + 社区 Patch 增量 + 多源交叉校验**，数据与代码彻底解耦，使用者无需爬虫。

---

## 两个产品

| 产品 | 说明 |
|------|------|
| **npm 包** (`@cndiv/*`) | 9 个包：数据快照、只读查询、CLI 注水导出、区划码校验、采集爬虫、法令抽取 |
| **交互式站点** | [时光机](https://tonyc726.github.io/china-administrative-division/) -- 四十年县级变迁可视化；64 万个村庄可全文搜索 |

---

## 快速上手

```bash
npm i -g @cndiv/cli

cndiv hydrate --year=2023                    # 下载 2023 全量数据到本地 SQLite
cndiv export --year=2023 --output=out.csv    # 导出 CSV
```

在代码里查询（`@cndiv/reader`，只读封装 `better-sqlite3`）：

```ts
import { openCache } from '@cndiv/reader';

const cn = openCache();
cn.findByCode('110101000000', 2023);                              // 东城区
cn.getChildren('110000000000', 2023, { skipPlaceholder: true });  // [东城区, 西城区, ...]
cn.close();
```

> 不想用 CLI？完整历年数据（五级 SQLite + 原始 JSON）见 GitHub Release
> [`data-snapshot-2023`](https://github.com/tonyc726/china-administrative-division/releases/tag/data-snapshot-2023)。

---

## 包参考

| 我想做什么 | 用这个包 |
|------------|----------|
| 校验 / 解析 12 位区划码（判级、取父码、补零） | [`@cndiv/core`](./packages/core) -- 纯函数、零依赖 |
| 在代码里查询注水后的数据 | [`@cndiv/reader`](./packages/reader) |
| 命令行：注水、应用 patch、导出 | [`@cndiv/cli`](./packages/cli) |
| 校验社区 Patch / 复用 SQLite schema | [`@cndiv/data-protocol`](./packages/data-protocol) |
| 直接使用快照数据 | [`@cndiv/source-2023`](./packages/source-2023) · [`@cndiv/source-history`](./packages/source-history) · [`@cndiv/source-postal`](./packages/source-postal) |

> 维护侧包（采集 `@cndiv/crawler`、公告抽取 `@cndiv/extractor`）见 [在线文档](https://tonyc726.github.io/china-administrative-division/)「包参考」章节。

---

## 时光机

`apps/web/` 是一个独立的 React + Tailwind CSS 交互式站点，展示 1980--2026 年中国县级行政区划的变迁。

- 逐年动画：被撤销的县名在所属省份上烧成灰飘散，新名字从同一块土地上长出来
- 堆叠面积图：县 / 区 / 县级市三类单位的四十年构成变化
- 全文搜索：62 万个村和社区，中文或拼音均可搜
- 村名里的中国：最常见的村名（"和平" 778 个）、姓氏村庄（"王家" 1406 个）、南塘北屯通名地理分布

---

## 贡献 Patch

行政区划变更（撤县设区、更名、新设社区等）以 JSON Patch 格式提交到 `patches/<YYYY>/`，PR 由 CI 自动校验。

提交格式与本地校验见 [贡献指南](https://tonyc726.github.io/china-administrative-division/guide/contributing-patch)。

---

## 开发

```bash
pnpm install         # 自动启用 .githooks（pre-commit 拦大文件 / 数据库）
pnpm build           # tsc -b 增量构建全部包
pnpm typecheck && pnpm lint && pnpm test && pnpm validate-patches   # 本地复刻 CI 门禁
```

架构设计、采集运维、发版流程见 [在线文档](https://tonyc726.github.io/china-administrative-division/)。

---

## 数据来源与许可

数据来源于公开政府网站（国家统计局、民政部国家地名信息库），仅供学习与研究使用。代码以 [MIT](./LICENSE) 许可。

| 来源 | 用途 | 链接 |
|------|------|------|
| 国家地名信息库 | 2021--2026 增量主源、交叉校验 | <https://dmfw.mca.gov.cn> |
| 民政部 | 县级以上行政区划变更法令 | <https://www.mca.gov.cn> |
| GB/T 2260 | 1980--2020 逐年全量快照 | 历史国标编码 |
| modood/Administrative-divisions-of-China | 历史五级镜像参考 (WTFPL) | <https://github.com/modood/Administrative-divisions-of-China> |
