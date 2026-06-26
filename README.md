# China Administrative Division · 中国行政区划数据基础设施

[![Validate Patches](https://github.com/tonyc726/china-administrative-division/actions/workflows/validate-patches.yml/badge.svg)](https://github.com/tonyc726/china-administrative-division/actions/workflows/validate-patches.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

中华人民共和国行政区划代码的历史数据库与可持续更新基础设施。提供 **GB2260 国标**（省/市/县，1980–2023）与 **NBS 统计用区划代码**（省/市/县/乡/村五级，2009–2023）的历年快照。

## 背景：为什么是 v2

原数据源国家统计局 `stats.gov.cn`（统计用区划代码和城乡划分代码）自 **2024 年起停止公开发布**、**2026 年起统一转向「国家地名信息库」**（dmfw.mca.gov.cn），全量五级数据已无官方活源。

因此 v2 架构从"镜像一个源"转为**"2023 基线快照 + 社区 Patch 增量 + 多源合成"**，并把数据与代码彻底解耦：

```
构建期(维护者)                     分发                用户运行期
历史源/dmfw/镜像 → 合成 → SQLite → NPM @cndiv/source-YYYY → cndiv hydrate → ~/.cndiv/cache.db
                                  + GitHub Release 归档        + patches/*.json  → cndiv apply-patch
```

- **用户侧零爬虫**：只从 NPM 拉取数据包注水到本地 SQLite。
- **大数据不进 git**：仓库历史曾因 GB 级 SQLite 膨胀并被迫 `git-filter-repo` 清理；现以 `.gitignore`（内容型规则）+ pre-commit 钩子杜绝复发。数据走 NPM / GitHub Release 分发。

## Monorepo 结构

| 包 | 职责 |
|---|---|
| [`@cndiv/core`](./packages/core) | 领域模型（5 级区划）与区划码校验（`validateCode` / `getLevelFromCode` / `getParentCode`，码结构 2+2+2+3+3） |
| [`@cndiv/data-protocol`](./packages/data-protocol) | 唯一真相源：SQLite `DATABASE_SCHEMA` + 基于 Zod 的 Patch 协议（`validatePatch`） |
| [`@cndiv/cli`](./packages/cli) | `cndiv` 命令行：`hydrate` / `apply-patch` / `migrate` / `export` |
| [`@cndiv/crawler`](./packages/crawler) | 增量采集（对接国家地名信息库 dmfw，产出 Patch）— 🚧 开发中 |
| [`legacy/`](./legacy) | v1 旧版爬虫历史存档（仅参考，数据源已失效） |

## 数据获取

### 方式一：CLI 注水（推荐）

```bash
npm i -g @cndiv/cli      # 或 pnpm add -g

cndiv hydrate --year=2023     # 下载 @cndiv/source-2023 → ~/.cndiv/cache.db
cndiv apply-patch --patch=patches/2025/310115-pudong-update.json
cndiv export --year=2023 --output=divisions-2023.csv
```

> ⚠️ 参数使用 `--key=value` 连写形式（如 `--year=2023`）。

### 方式二：直接下载历史快照

完整历年数据（GB2260 1980–2023、NBS 2009–2023 五级 SQLite + 原始 JSON）见 GitHub Release
[`data-snapshot-2023`](https://github.com/tonyc726/china-administrative-division/releases/tag/data-snapshot-2023)。
逐文件 SHA-256 完整性清单见 [`docs/DATA-ASSETS.md`](./docs/DATA-ASSETS.md)，数据字典见 Release 内 `SQLITE_DATA_README.md`。

```bash
# 校验并解压
shasum -a 256 -c SHA256SUMS.txt
tar -xzf nbs-sqlite-2009-2023.tar.gz
sqlite3 NBS.2023.sqlite "SELECT count(*) FROM village;"   # → 620573
```

## 数据模型

12 位统计用区划代码结构 **2+2+2+3+3**（省/市/县/乡镇街道/村居委会）：

```
11      01      01      001       001
省(2)   市(2)   县(2)   乡镇(3)   村(3)
```

存储为扁平邻接表 `divisions(code, name, level, parent_code, year, status, source_type, confidence_score)`，复合主键 `(code, year)` 支持同一区划码跨年份版本化。来源置信度分 4 档：`official_nbs > mca_decree > community > shadow_map`。

## 贡献 Patch

行政区划变更（撤县设区、更名、新设社区等）以 JSON Patch 提交到 `patches/<YYYY>/`：

```jsonc
{
  "meta": { "author": "...", "source_url": "...", "evidence_confidence": "high", "apply_after": "2023-baseline" },
  "operations": [
    { "op": "add", "code": "310115001002", "name": "新设立社区居委会", "level": 5, "parent_code": "310115001000" },
    { "op": "update", "code": "310115102000", "status": "deprecated", "note": "撤销合并" }
  ]
}
```

PR 会由 CI（`validate-patches.yml`）用 `validatePatch` 自动校验。本地校验：`node scripts/validate-patches.mjs`。

## 开发

```bash
pnpm install         # 自动启用 .githooks（pre-commit 拦大文件/数据库）
pnpm -r build        # 构建全部包
```

## 数据来源与许可

数据来源于公开政府网站（国家统计局、民政部国家地名信息库），仅供学习与研究使用。代码以 [MIT](./LICENSE) 许可。

- 国家地名信息库（增量主源）：https://dmfw.mca.gov.cn
- 历史五级镜像参考：[modood/Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China)（WTFPL）
