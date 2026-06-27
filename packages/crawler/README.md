# @cndiv/crawler

> 后统计局时代的增量采集引擎：抓取国家地名信息库(dmfw) → 与基线差分 → 产出社区 Patch

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

## 管线

```
dmfw 全量快照 ─(crawlAll)→ Division[] ─(loadBaselineCsv 对齐基线 + diffToPatch)→ Patch ─(@cndiv/data-protocol validatePatch 守门)→ patches/<year>/*.json
```

另有一条独立支线：`cndiv-postal` 抓 ip138 邮编/区号，产出 `@cndiv/source-postal` 数据包（CSV + 确定性 manifest）。

## ⚠️ 头号坑：dmfw 与 NBS 层级口径不一致（差分前务必读）

- **层级建模差异（最易踩）**：dmfw 扁平直挂（市直接挂街道/乡镇），NBS/GB2260 在直辖市、省直管等处保留「市辖区 / 省直管」占位中间层。两者直接差分，会把这层口径差异误判成**大量伪变更**，典型就是直辖市辖区的**假 `move`**。**dmfw 增量必须先把层级归一化到与基线一致**，否则产出的 patch 几乎全是噪声。本工具已按「抓取根省前缀 + 实际抓到的层级」自动收窄差分范围，但占位中间层的归一化仍需调用方按基线口径处理。
- **默认抑制 remove**：dmfw 覆盖范围 < NBS（无村级 level5、无开发区/管委会等乡级特殊单位），"基线有、dmfw 无" 多是口径差异而非真实撤销。故 `cndiv-crawl` 默认 `--removes=off`；被抑制的 remove 数量会打印（不静默丢弃），需人工复核时显式 `--removes=on`。
- **空名跳过**：dmfw 偶发 `name=null` 节点，无法产出合法 add/update（schema 要求 name 非空），差分时跳过并计入 `skippedEmptyName`（不静默丢弃）。
- **断点续爬**：抓取结果按 `--cache` 目录落盘，**相同 `--cache` 目录重跑即跳过已抓节点续跑**；失败节点会打印 code，可直接重跑补齐。

## 安装

```bash
# 作为 CLI（两个 bin：cndiv-crawl / cndiv-postal）
npm i -g @cndiv/crawler

# 作为库
npm i @cndiv/crawler
```

> 所有 flag 均为 `--key=value` 形式（含 `--cache`、`--removes`），**没有裸布尔开关**。

## CLI

### `cndiv-crawl` — 全量抓取 → 差分 → `patches/<year>/`

| flag | 默认 | 说明 |
| --- | --- | --- |
| `--year=<YYYY>` | 当前年 | 数据年份，同时决定默认 `--out` / `--cache` |
| `--baseline=<csv>` | **必填** | 差分基线，`build-source` 产出的 divisions CSV |
| `--root=<code>` | 全国(`''`) | 仅抓某省/某子树（验证或分批），如 `640000000000` |
| `--out=<dir>` | `patches/<year>` | patch 输出目录 |
| `--concurrency=<n>` | `6` | 每层并发请求数 |
| `--maxLevel=<n>` | `4` | 最深层级（1省 2市 3县 4乡镇街道；dmfw 无村级 5） |
| `--cache=<dir>` | `.cache/crawler-<year>` | 抓取缓存目录；同目录重跑=断点续爬 |
| `--author=<name>` | `dmfw-crawler` | 写入 `patch.meta.author` |
| `--removes=on\|off` | `off` | 是否产出 remove 操作（值形式，非裸布尔） |

```bash
# 全国，2026 年，对齐 2023 基线
cndiv-crawl --year=2026 --baseline=packages/source-2023/data/divisions.csv

# 仅宁夏（验证/分批）+ 自定义并发
cndiv-crawl --year=2026 --baseline=packages/source-2023/data/divisions.csv --root=640000000000 --concurrency=8

# 同 --cache 目录重跑 = 断点续爬
cndiv-crawl --year=2026 --baseline=packages/source-2023/data/divisions.csv --cache=.cache/crawler-2026

# 产出 remove 供人工复核（默认抑制）
cndiv-crawl --year=2026 --baseline=packages/source-2023/data/divisions.csv --removes=on
```

按省切分写出 `patches/<year>/<省码>0000000000-dmfw-<year>.json`，每个文件落盘前都经 `@cndiv/data-protocol` 的 `validatePatch` 守门，未过校验的 patch 被拒写（不静默丢弃）。

### `cndiv-postal` — 邮编/区号 → `@cndiv/source-postal` 数据包

| flag | 默认 | 说明 |
| --- | --- | --- |
| `--out=<dir>` | `packages/source-postal/data` | 输出目录 |
| `--delay=<ms>` | `150` | 每省抓取后限速等待毫秒 |

```bash
cndiv-postal --out=packages/source-postal/data --delay=200
```

产出 `postal.csv`（列 `province,name,zip_code,area_code`）+ `manifest.json`（含 `sha512`，确定性、无时间戳，便于完整性校验）；逐条经 `validatePostalRecord` 校验，零合法记录则中止写盘。

## 程序化 API

```ts
import {
  crawlAll,
  diffToPatch,
  fetchChildren,
  parseDivisionsCsv,
  loadBaselineCsv,
  fetchAllPostal,
} from '@cndiv/crawler';
```

```ts
// 从 rootCode（''=全国）逐层并发抓取整棵区划树，展开为扁平 Division[]
crawlAll(rootCode: string, options: CrawlAllOptions): Promise<CrawlAllResult>
//   CrawlAllOptions: { year: number; maxLevel?: number /*4*/; concurrency?: number /*6*/;
//                      delayMs?: number /*60*/; cacheDir?: string; onWave? }
//   CrawlAllResult: { divisions: Division[]; failures: string[]; fetched: number; cached: number }

// baseline → current 差分，产出 add/update/move/remove；仅比对 options.levels（默认 [1,2,3,4]）
diffToPatch(baseline: Division[], current: Division[], options: DiffOptions): DiffResult
//   DiffOptions: { author: string; source_url?: string; apply_after?: string; levels?: number[] }
//   DiffResult: { patch: Patch; skippedEmptyName: number }

// 抓取某节点的直接子节点（''=省级）——上面两者共享的唯一抓取原语
fetchChildren(code: string): Promise<DmfwNode[]>

// 解析 build-source 的 divisions CSV 为 Division[]（作差分基线）
parseDivisionsCsv(content: string): Division[]
loadBaselineCsv(filePath: string): Promise<Division[]>

// 顺序限速抓取全部大陆省份邮编/区号
fetchAllPostal(options?: FetchAllOptions): Promise<PostalRecord[]>
//   FetchAllOptions: { delayMs?: number /*150*/; onProvince?: (name: string, count: number) => void }
```

## 示例

```ts
import { crawlAll, loadBaselineCsv, diffToPatch } from '@cndiv/crawler';

const baseline = await loadBaselineCsv('packages/source-2023/data/divisions.csv');
const { divisions, failures } = await crawlAll('', {
  year: 2026,
  maxLevel: 4,
  concurrency: 6,
  cacheDir: '.cache/crawler-2026', // 提供即开启断点续爬
});

const { patch, skippedEmptyName } = diffToPatch(baseline, divisions, {
  author: 'bot',
  source_url: 'https://dmfw.mca.gov.cn/',
  apply_after: '2023-baseline',
});

// ⚠️ patch.operations 是草稿，写盘前须经 @cndiv/data-protocol 的 validatePatch 守门。
// 并记得先处理 NBS「市辖区/省直管」占位层归一化，否则会混入直辖市辖区的伪 move。
console.log(patch.operations.length, '个操作，跳过空名', skippedEmptyName, '失败', failures.length);
```

## License

MIT © [tonyc726](https://github.com/tonyc726)
