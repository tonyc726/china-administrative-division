# @cndiv/crawler

> 后统计局时代的增量采集引擎：抓取国家地名信息库(dmfw) → 与基线差分 → 产出社区 Patch

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

## 管线

```
dmfw 全量快照 ─(crawlAll)→ Division[] ─(loadBaselineCsv 对齐基线 + diffToPatch，内含 canonicalizeParent 层级归一化)→ Patch ─(validatePatch 守门 + cndiv-verify 结构性门禁)→ patches/<year>/*.json
```

另有一条独立支线：`cndiv-postal` 抓 ip138 邮编/区号，产出 `@cndiv/source-postal` 数据包（CSV + 确定性 manifest）。

## ⚠️ 头号坑：dmfw 与 NBS 层级口径不一致（差分前务必读）

- **层级建模差异（最易踩）**：dmfw 扁平直挂（市直接挂街道/乡镇），NBS/GB2260 在直辖市、省直管等处保留「市辖区 / 省直管」占位中间层。两者直接差分，会把这层口径差异误判成**大量伪变更**（首跑实测 48 直辖市区 + 5 省直管市假 `move`）。**`diffToPatch` 已内置归一化，调用方无需再处理**：`normalize.canonicalizeParent` 以 12 位码结构派生父码（`getParentCode`）覆盖 dmfw 上报的扁平父码，对基线/当前两侧施加（对 NBS 幂等），假 `move` 归零、真·新增自动落到占位层下；`normalize.isPlaceholder` 识别「市辖区 / 省直辖县级行政区划」占位层并在 remove 分支豁免（独立于 `--removes` 总开关），占位层不产假 remove。本工具另按「抓取根省前缀 + 实际抓到的层级」自动收窄差分范围。
- **默认抑制 remove**：dmfw 覆盖范围 < NBS（无村级 level5、无开发区/管委会等乡级特殊单位），"基线有、dmfw 无" 多是口径差异而非真实撤销。故 `cndiv-crawl` 默认 `--removes=off`；被抑制的 remove 数量会打印（不静默丢弃），需人工复核时显式 `--removes=on`。
- **空名跳过**：dmfw 偶发 `name=null` 节点，无法产出合法 add/update（schema 要求 name 非空），差分时跳过并计入 `skippedEmptyName`（不静默丢弃）。
- **断点续爬**：抓取结果按 `--cache` 目录落盘，**相同 `--cache` 目录重跑即跳过已抓节点续跑**；失败节点会打印 code，可直接重跑补齐。

## 安装

```bash
# 作为 CLI（5 个 bin：cndiv-crawl / cndiv-postal / cndiv-xzqh / cndiv-prov-township / cndiv-verify）
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

### `cndiv-verify` — patch 结构性门禁（schema 之上的语义校验）

`validatePatch` 只校验字段形状；`cndiv-verify --mode=structural` 补**语义/引用完整性**校验并产出 CI 门禁信号。**完全离线、确定性**——只读 baseline 码集 + `@cndiv/core` 码工具，无网络（CI 门禁不可因 dmfw 反爬随机变红）。

| flag | 默认 | 说明 |
| --- | --- | --- |
| `--mode=structural\|cross` | `structural` | `structural`=离线结构门禁；`cross`=商业地图交叉校验（合规桩，未实现） |
| `--patch=<file\|dir>` | `patches` | 待校验的 patch 文件或目录（递归 `*.json`） |
| `--baseline=<csv>\|off` | `packages/source-2023/data/divisions.csv` | 引用完整性基线；`off` 则仅做纯码结构自洽 |

```bash
# CI / 本地：对 patches/ 全量门禁（任一 error → 退出码 1）
cndiv-verify --mode=structural --patch=patches --baseline=packages/source-2023/data/divisions.csv
```

**规则**（error 阻断 / warning 打印不阻断）：`CODE_INVALID`、`ADD_LEVEL_MISMATCH`、`ADD_PARENT_MISMATCH`（与 `canonicalizeParent` 同一不变量）、`ADD_DUPLICATE`、`TARGET_MISSING`、`NEWPARENT_INVALID/SELF/MISSING`、`DUP_OP_CONFLICT/DUP_OP`、`ADD_PARENT_MISSING`。已接入 `.github/workflows/ci.yml`。`cross` 为合规桩（商业源三重禁止，仅本地手动只读、产物不落库、不入 CI），详见 [`docs/patch-校验与交叉校验.md`](../../docs/patch-校验与交叉校验.md)。

## 程序化 API

```ts
import {
  crawlAll,
  diffToPatch,
  canonicalizeParent, // 层级归一化：码结构派生父码覆盖上报父码
  isPlaceholder, // 识别「市辖区/省直辖县级行政区划」占位层
  verifyStructural, // patch 结构性校验（离线确定性）
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
// 内部对两侧施加 canonicalizeParent 归一化 + isPlaceholder 豁免，调用方无需自行处理占位层
diffToPatch(baseline: Division[], current: Division[], options: DiffOptions): DiffResult
//   DiffOptions: { author: string; source_url?: string; apply_after?: string; levels?: number[] }
//   DiffResult: { patch: Patch; skippedEmptyName: number; revokedBySuffix: number }

// 结构性校验：码/层级/父级自洽 + 对 baseline 的引用完整性（离线确定性，CI 门禁核心）
verifyStructural(patch: Patch, opts?: { baselineCodes?: ReadonlySet<string> }): StructuralReport
//   StructuralReport: { errors: Issue[]; warnings: Issue[]; checked: number }

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

> 归一化 + 结构性门禁的可跑示例（无需网络/基线文件）：`npx tsx packages/crawler/examples/verify-patch.ts`

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

// ⚠️ patch.operations 是草稿，写盘前须经 @cndiv/data-protocol 的 validatePatch 守门，
// 建议再过 cndiv-verify 结构性门禁。占位层归一化已由 diffToPatch 内部处理，无需手动对齐。
console.log(patch.operations.length, '个操作，跳过空名', skippedEmptyName, '失败', failures.length);
```

## License

MIT © [tonyc726](https://github.com/tonyc726)
