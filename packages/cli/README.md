# @cndiv/cli

> 中国行政区划数据的命令行工具：从 NPM/离线 tarball 注水到本地 SQLite，并打通 crawler → patch → 回灌闭环。

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

本包是整个 Monorepo **唯一面向终端用户的可执行文件**，安装后提供 `cndiv` 命令；同时导出一组可编程 API。

## 安装

```bash
npm i -g @cndiv/cli      # 全局，得到 cndiv 命令
# 或免安装：
npx @cndiv/cli hydrate --year=2023
```

## 命令速查

> **铁律**：所有参数必须 `--key=value` **连写**，不支持空格分隔（`--year 2023` 无效，须写 `--year=2023`）。

| 命令 | 参数 | 说明 |
| --- | --- | --- |
| `hydrate` | `--year=<YYYY>` `[--cache=<dir>]` `[--tarball=<tgz>]` `[--verbose]` | 从 NPM 包 `@cndiv/source-<year>` 下载并导入到本地 `cache.db`；`--tarball` 走离线注水 |
| `migrate` | `--input=<dir>` `[--output=<db>]` `[--csv=<datapackage.csv>]` | 把 legacy GB2260 历史快照（`*.json[.gz]` 扁平数组）迁入按 `(code,year)` 版本化的 SQLite |
| `export` | `--year=<YYYY>` `[--output=<file>]` `[--cache=<dir>]` | 把某年份分区导出为 CSV（无 `--output` 则打到 stdout） |
| `apply-patch`（别名 `patch`） | `--patch=<file>` `[--cache=<dir>]` `[--dry-run]` | 把社区/爬虫 Patch 应用到 `cache.db`（按 `apply_after` 基线年克隆到目标年） |
| `backfill` | `--year=<YYYY>` `[--cache=<dir>]` `[--output=<csv>]` | 回灌：把已 apply 的某年份分区导出回 `source-<year>` CSV，合上闭环 |
| `version`（`-v` / `--version`） | — | 打印版本 |
| `help`（`-h` / `--help`） | — | 打印帮助（缺省命令时同样输出帮助） |

### 约定

- **缓存目录**默认 `~/.cndiv`，可用 `--cache=<dir>` 覆盖；SQLite 数据库固定落在 `<cache>/cache.db`。
- **`migrate --output`** 默认 `./dist/source-history.db`；**`backfill --output`** 默认 `packages/source-<year>/data/divisions.csv`。
- **完整性校验（fail-closed）**：`--tarball` 离线注水时，包内 `manifest.json` 的 `SHA-512` 与 CSV 比对，**校验通过后才入库**，不符则一行都不写、直接中止（杜绝"先写后校验"污染缓存）。从 NPM 下载则额外用 registry 的 shasum 校验下载内容。

### 示例

```bash
# 在线注水（拉取 @cndiv/source-2023 → ~/.cndiv/cache.db）
cndiv hydrate --year=2023

# 离线注水（直接消费 GitHub Release 附件 .tgz，带 SHA-512 校验）
cndiv hydrate --year=2023 --tarball=./cndiv-source-2023-2023.0.0.tgz

# 迁移 legacy GB2260，并固化为多年份数据包 CSV
cndiv migrate --input=./legacy/data/GB2260 --output=./dist/source-history.db --csv=./dist/divisions.csv

# 导出 / 应用 Patch / 回灌
cndiv export --year=2023 --output=./2023.csv
cndiv apply-patch --patch=patches/2025/310115-pudong-update.json --dry-run
cndiv backfill --year=2025 --output=packages/source-2025/data/divisions.csv
```

## 数据闭环

```
crawler ─→ patches/<YYYY>/*.json ─(apply-patch)→ cache.db ─(backfill)→ source-<year> CSV ─(重建/发布)→ @cndiv/source-<year>
```

`apply-patch` 在写库前用 `@cndiv/data-protocol` 的 `validatePatch` 严格校验（op 形状 / 12 位码 / level 范围 / 枚举）；克隆、应用、审计写入同一事务，避免"数据已改、审计失败"的中间态。

## 查询注水后的数据

> ⚠️ **本仓库未提供封装查询 API**。`cndiv` 只负责把数据注水进 `cache.db`，消费者请用 [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) + 原生 SQL 直查 `divisions` 表。

`divisions` 表结构（来自 `@cndiv/data-protocol` 的 `DATABASE_SCHEMA`）：

```sql
CREATE TABLE divisions (
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,        -- 1 省级 / 2 市级 / 3 县级 / 4 乡级 …（数字越大越深）
    parent_code TEXT,
    year INTEGER NOT NULL,
    status TEXT DEFAULT 'active',  -- active / deprecated
    source_type TEXT,
    confidence_score INTEGER,
    urban_rural_code TEXT,
    PRIMARY KEY (code, year)       -- 复合主键：同一码可跨多年并存
);
```

直查时务必避开两个坑：

1. **复合主键 `(code, year)`**：按码查询**必须带 `year`**，否则会跨年命中多行。
   ```ts
   db.prepare('SELECT * FROM divisions WHERE code=? AND year=?').get('110101000000', 2023);
   ```
2. **直辖市「市辖区占位层」**：直辖市（北京/天津/上海/重庆）省级的直接子级是一层名为「市辖区」的占位中间层，**要再下钻一层**才到真正的区。
   ```ts
   // 北京(110000) 的直接子级 → [{ name: '市辖区' }]，需对 110100 再查一次才得到东城/西城…
   db.prepare('SELECT name FROM divisions WHERE parent_code=? AND year=?').all('110100000000', 2023);
   ```

可运行的完整示例（含递归 CTE 查全部后代、配合 `@cndiv/core` 纯码工具）：

```bash
npx tsx packages/cli/examples/query-cache.ts
```

## 程序化 API

```ts
import { hydrate, exportFromCache, applyPatch, migrate } from '@cndiv/cli';

// 注水（cacheDir 默认 ~/.cndiv；tarball 走离线注水）
await hydrate({ year: '2023', cacheDir, tarball, verbose });

// 从 cache.db 导出某年份为 CSV（无 outputPath 则打到 stdout）
await exportFromCache(2023, cacheDir, './2023.csv');

// 应用 Patch（dryRun 仅预览不落库）
await applyPatch({ patch: 'patches/2025/310115-pudong-update.json', cacheDir, dryRun });

// 迁移 legacy GB2260；output 必填，csv 可选（同时固化数据包 CSV+manifest）
const result = await migrate({ input: './legacy/data/GB2260', output: './dist/source-history.db', csv });
// result: { files, records, skipped, years, csvPath?, csvRows?, csvSha512? }
```

> 注：CLI 运行器 `cli.ts` 是 `bin` 入口，不在库表面——`import '@cndiv/cli'` 零副作用，不会触发命令执行。`MigrateOptions` / `MigrateResult` 类型一并导出。

## License

MIT © [tonyc726](https://github.com/tonyc726)
