# @cndiv/source-2023

> NBS 五级行政区划数据快照（2023 年度）：`divisions.csv`（约 66.5 万行 / 52.7 MB）+ 随包 `manifest.json` 提供 SHA-512 完整性凭据

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

本包是**纯数据包**（`files: ["data"]`，无运行时代码）：发布物仅 `data/divisions.csv` 与 `data/manifest.json` 两个文件。

## 数据结构

`data/divisions.csv` —— 表头 + 665271 行，UTF-8，8 列：

| 列 | 含义 | 示例 |
| --- | --- | --- |
| `code` | 12 位定长行政区划码（NBS） | `110000000000` |
| `name` | 名称 | `北京市` |
| `level` | 层级 1–5：1 省 / 2 市 / 3 县 / 4 乡镇 / 5 村 | `1` |
| `parent_code` | 父级 12 位码；顶层（`level=1`）为空 | （空） |
| `year` | 数据年份 | `2023` |
| `status` | 行政区状态 | `active` |
| `source_type` | 来源类型 | `official_nbs` |
| `confidence_score` | 置信分 0–100（官方 NBS 记为 100） | `100` |

首行示例：

```csv
code,name,level,parent_code,year,status,source_type,confidence_score
110000000000,"北京市",1,,2023,active,official_nbs,100
```

## 消费方式

### ① cndiv hydrate 注水（推荐）

由 [`@cndiv/cli`](https://github.com/tonyc726/china-administrative-division) 把本数据包导入本地缓存库 `~/.cndiv/cache.db`，后续按码/名查询、应用 Patch 增量都走该库：

```bash
# 从 npm registry 拉取 @cndiv/source-2023 并注水（默认缓存目录 ~/.cndiv）
cndiv hydrate --year=2023

# 离线注水：直接喂打包好的 tarball，无需联网
cndiv hydrate --year=2023 --tarball=./cndiv-source-2023-2023.0.0.tgz

# 自定义缓存目录（生成 <dir>/cache.db）
cndiv hydrate --year=2023 --cache=~/.cndiv
```

注水**先校验后入库**（见下文完整性校验）：校验通过才写入 `cache.db`，失败则一行都不落库。

### ② 直读 CSV（createRequire 解析包内文件）

包未声明 `exports` 子路径映射，因此可经文件系统回退直接 `resolve` 到 `data/` 下的文件：

```ts
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

const csvPath = require.resolve('@cndiv/source-2023/data/divisions.csv');
const manifestPath = require.resolve('@cndiv/source-2023/data/manifest.json');

const csv = readFileSync(csvPath, 'utf-8'); // 约 66.5 万行 / 52.7 MB，建议流式按行解析
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
```

> 52.7 MB 全量读入会驻留较大内存；对大批量处理建议用流式 CSV 解析逐行消费。

## 完整性校验（SHA-512）

`data/manifest.json` 是数据包的完整性凭据，随 `files: ["data"]` 一并发布：

```json
{
  "year": 2023,
  "source": "NBS",
  "format": "csv",
  "file": "divisions.csv",
  "rows": 665271,
  "levels": 5,
  "bytes": 52711715,
  "sha512": "2715f2ced2d208af533ea62c0106ef901bf695c83691ff8a6463d4c21ae6d1396e4b9e8d275b42a45bb043016b34bd96272add2c32f116cf4df8ab3ed205f658",
  "placeholders_skipped": 5,
  "generator": "@cndiv/cli build-source"
}
```

`cndiv hydrate` 对此实行 **fail-closed 完整性门**：先把 `divisions.csv` 全量缓冲，计算 SHA-512 与 `manifest.sha512` 比对，**一致才导入**；不一致即判定数据损坏或被篡改，**中止注水且不写入任何数据**。离线注水无 registry shasum，`manifest.json` 是唯一校验凭据。自验：

```bash
shasum -a 512 node_modules/@cndiv/source-2023/data/divisions.csv
# 输出需与 manifest.json 的 sha512 完全一致
```

## 关于 `placeholders_skipped`

`placeholders_skipped: 5` 记录构建本数据包时**被剔除的「市辖区」占位层数量**。NBS 原始层级中存在仅作层级占位、无独立行政实体的「市辖区」节点；构建（`@cndiv/cli build-source`）阶段将其跳过，使 `divisions.csv` 的 `level/parent_code` 父子链更贴近真实行政实体。该字段是构建可观测性指标，便于核对剔除规模，不影响已入库数据的查询。

## License

MIT © [tonyc726](https://github.com/tonyc726)
