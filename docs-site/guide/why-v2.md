# 为什么是 v2

## 背景：官方活源消失

原数据源国家统计局 `stats.gov.cn`（统计用区划代码和城乡划分代码）自 **2024 年起停止公开发布**、**2026 年起统一转向「国家地名信息库」**（[dmfw.mca.gov.cn](https://dmfw.mca.gov.cn)），全量五级数据已无官方活源。

v1 的做法是「镜像一个源」——直接爬 `stats.gov.cn` 并固化。源一旦冻结/下线，整套方案随之失效。

## v2：从镜像一个源 → 基线 + 增量 + 多源合成

因此 v2 架构从「镜像一个源」转为 **「2023 基线快照 + 社区 Patch 增量 + 多源合成」**，并把数据与代码彻底解耦：

```
构建期(维护者)                     分发                用户运行期
历史源/dmfw/镜像 → 合成 → SQLite → NPM @cndiv/source-YYYY → cndiv hydrate → ~/.cndiv/cache.db
                                  + GitHub Release 归档        + patches/*.json  → cndiv apply-patch
```

关键取舍：

- **用户侧零爬虫**：只从 NPM 拉取数据包注水到本地 SQLite，不依赖任何在线源可用性。
- **大数据不进 git**：仓库历史曾因 GB 级 SQLite 膨胀并被迫 `git-filter-repo` 清理；现以 `.gitignore`（内容型规则）+ pre-commit 钩子杜绝复发。数据走 NPM / GitHub Release 分发。
- **来源可追溯**：置信度分 4 档 `official_nbs > mca_decree > community > shadow_map`，每条数据可回答「它从哪来、可信度多高」。

## 三条数据源替代路线

| 层 | 来源 | 角色 |
|---|---|---|
| 基线 | NBS 2023 五级全量（冷母本 SQLite） | 不可变基准，村级 620,573 条冻结 |
| 增量主源 | 国家地名信息库 dmfw（79 号令年更 + xzqh 事件流） | `@cndiv/crawler` 逐层 BFS 差分产出 Patch |
| 参考镜像 | [modood/Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China)（WTFPL）等 | 交叉校验、历史补全 |

## 数据闭环

```
crawler 抓取 → patches/<YYYY>/ → apply-patch（克隆到目标年）
             → backfill 导回 source-<year>/divisions.csv → 重建数据包
```

## 与旧库的差异化

相比只提供「某一版全量」的社区库，v2 的核心价值是：

- **历年版本化**：复合主键 `(code, year)`，同一区划码可跨年份并存，支持「2015 年的 310115 是什么」这类时点查询。
- **后统计局时代仍可更新**：官方停更后，仍能通过 dmfw 事件流 + 社区 Patch 持续维护。
- **完整性可校验**：数据包 `manifest.json` 带 SHA-512，快照 Release 带逐文件 SHA-256。

下一步 → [快速上手](/guide/getting-started)
