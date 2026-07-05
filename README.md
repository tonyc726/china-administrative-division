<p align="center">
  <img src="./docs-site/public/logo.svg" width="88" height="88" alt="cndiv logo">
</p>

# China Administrative Division · 中国行政区划数据基础设施

[![Docs](https://img.shields.io/badge/%E5%9C%A8%E7%BA%BF%E6%96%87%E6%A1%A3-cndiv-brightgreen?logo=vuedotjs)](https://tonyc726.github.io/china-administrative-division/)
[![Validate Patches](https://github.com/tonyc726/china-administrative-division/actions/workflows/validate-patches.yml/badge.svg)](https://github.com/tonyc726/china-administrative-division/actions/workflows/validate-patches.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**中华人民共和国行政区划代码的历史数据库,以及一套持续更新它的基础设施。**

- **GB2260 国标** —— 省 / 市 / 县三级,1980–2023
- **NBS 统计用区划代码** —— 省 / 市 / 县 / 乡 / 村五级,2009–2023

原数据源国家统计局 `stats.gov.cn` 自 2024 年起停更、2026 年转向国家地名信息库。v2 因此改为 **「2023 基线快照 + 社区 Patch 增量 + 多源合成」**,数据与代码彻底解耦、用户侧零爬虫。

## 快速上手

```bash
npm i -g @cndiv/cli

cndiv hydrate --year=2023                    # 下载 2023 全量数据 → 本地 ~/.cndiv/cache.db(标准 SQLite)
cndiv export --year=2023 --output=out.csv    # 导出 CSV
```

在代码里查询(`@cndiv/reader` 只读封装 `better-sqlite3`):

```ts
import { openCache } from '@cndiv/reader';

const cn = openCache();
cn.findByCode('110101000000', 2023);                              // → 东城区
cn.getChildren('110000000000', 2023, { skipPlaceholder: true });  // → [东城区, 西城区, …]
cn.close();
```

> 不想用 CLI?完整历年数据(五级 SQLite + 原始 JSON)见 GitHub Release
> [`data-snapshot-2023`](https://github.com/tonyc726/china-administrative-division/releases/tag/data-snapshot-2023)。

## 装哪个包

大多数使用者只需下面一个。**完整 API、示例与已知坑请看[在线文档](https://tonyc726.github.io/china-administrative-division/)。**

| 我想做什么 | 用这个包 |
|---|---|
| 校验 / 解析 12 位区划码(判级、取父码、补零) | [`@cndiv/core`](./packages/core) —— 纯函数、零依赖 |
| 在代码里查询注水后的数据 | [`@cndiv/reader`](./packages/reader) |
| 命令行:注水、应用 patch、导出 | [`@cndiv/cli`](./packages/cli) |
| 校验社区 Patch / 复用 SQLite schema | [`@cndiv/data-protocol`](./packages/data-protocol) |

> 维护侧包(采集 `@cndiv/crawler`、公告抽取 `@cndiv/extractor`)与数据包(`@cndiv/source-*`)见文档站「包参考」。

## 贡献 Patch

行政区划变更(撤县设区、更名、新设社区等)以 JSON Patch 提交到 `patches/<YYYY>/`,PR 由 CI 自动校验。
提交格式与本地校验见 [贡献指南](https://tonyc726.github.io/china-administrative-division/guide/contributing-patch)。

## 开发

```bash
pnpm install         # 自动启用 .githooks(pre-commit 拦大文件 / 数据库)
pnpm build           # tsc -b 增量构建全部包
pnpm typecheck && pnpm lint && pnpm test && pnpm validate-patches   # 本地复刻 CI 门禁
```

架构设计、采集运维、发版流程见[在线文档](https://tonyc726.github.io/china-administrative-division/)。

## 数据来源与许可

数据来源于公开政府网站(国家统计局、民政部国家地名信息库),仅供学习与研究使用。代码以 [MIT](./LICENSE) 许可。

- 国家地名信息库(增量主源):<https://dmfw.mca.gov.cn>
- 历史五级镜像参考:[modood/Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China)(WTFPL)
