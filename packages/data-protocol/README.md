# @cndiv/data-protocol

> 行政区划数据的协议层：Patch 校验、SQLite 建表 SQL、邮编/区号契约、divisions CSV 列规范——全部基于 Zod 的运行时单一真相源

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

## 安装

```bash
npm install @cndiv/data-protocol
```

依赖 `zod@^4` 与 `@cndiv/core`（其中 `level / status / source_type` 的合法值来自 `@cndiv/core` 的领域枚举，本包不重复硬编码字面量）。

## 模块概览

| 子模块 | 职责 | 关键导出 |
| --- | --- | --- |
| `patch` | 社区 Patch 协议与守门校验 | `validatePatch` · `PatchSchema` / `Patch` · `OperationSchema` / `Operation` · `PATCH_OPERATION` · `CONFIDENCE_LEVELS` · `PatchMetaSchema` |
| `database` | SQLite 建表与批量写入 SQL 字符串 | `DATABASE_SCHEMA` · `INSERT_DIVISIONS_BATCH` |
| `postal` | 邮编 + 长途区号记录契约 | `PostalRecordSchema` · `validatePostalRecord` · `PostalRecord` |
| `csv` | divisions CSV 写入侧列契约与转义 | `DIVISIONS_CSV_HEADER` · `csvCell` |

全部从包根导出：

```ts
import {
  validatePatch, PatchSchema, OperationSchema, PATCH_OPERATION, CONFIDENCE_LEVELS, PatchMetaSchema,
  DATABASE_SCHEMA, INSERT_DIVISIONS_BATCH,
  PostalRecordSchema, validatePostalRecord,
  DIVISIONS_CSV_HEADER, csvCell,
  type Patch, type Operation, type PostalRecord,
} from '@cndiv/data-protocol';
```

## Patch 协议

Patch 是社区贡献的**变更草稿**，写入 `patches/` 前必须经 `validatePatch` 守门（CI 的 validate-patches 同款）。

```ts
function validatePatch(
  data: unknown
): { success: true; data: Patch } | { success: false; error: string };
```

```ts
import { validatePatch } from '@cndiv/data-protocol';

const result = validatePatch(rawJson);
if (result.success) {
  // result.data: Patch（meta 缺省字段已被 Zod 默认值填充）
  applyOperations(result.data.operations);
} else {
  // result.error 是 Zod 序列化后的字符串（issues 的 JSON），不是人类友好文案
  console.error(result.error);
}
```

### 文件结构

```ts
PatchSchema = z.object({
  meta: PatchMetaSchema,
  operations: z.array(OperationSchema).min(1), // 至少 1 个操作
});
```

`PatchMetaSchema` 字段：

| 字段 | 类型 / 约束 | 默认值 |
| --- | --- | --- |
| `author` | string，1–100 字符（必填） | — |
| `source_url` | URL（可选） | — |
| `evidence_confidence` | `CONFIDENCE_LEVELS` 之一：`high` / `medium` / `low` | `medium` |
| `apply_after` | string，标注基线版本 | `2023-baseline` |
| `created_at` | ISO datetime（可选） | — |
| `notes` | string（可选） | — |

```ts
CONFIDENCE_LEVELS = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
```

### Operation：四类型判别联合

`OperationSchema = z.union([Add, Remove, Update, Move])`，由 `op` 字段判别。`PATCH_OPERATION = { ADD: 'add', REMOVE: 'remove', UPDATE: 'update', MOVE: 'move' }`。

```ts
// op: 'add'  —— 新增区划
{ op: 'add', code, name, level, parent_code, source_type?, confidence_score? }

// op: 'remove' —— 删除区划
{ op: 'remove', code, reason? }

// op: 'update' —— 更名 / 改状态 / 边界调整
{ op: 'update', code, name?, status?, new_parent?, note? }

// op: 'move'  —— 改挂父级（new_parent 必填）
{ op: 'move', code, new_parent }
```

各字段约束（全部由 Zod 在运行时强制）：

- `code` / `parent_code` / `new_parent`：**强制 12 位**字符串（`z.string().length(12)`）。`add` 的 `parent_code` 可为 `null`（省级无父）；`update` 的 `new_parent` 可选；`move` 的 `new_parent` 必填。
- `name`：1–100 字符。
- `level`：`@cndiv/core` 的 `DIVISION_LEVEL`，合法值 `1`（省）/`2`（市）/`3`（县）/`4`（乡镇/街道）/`5`（村/居委会）。
- `status`：`@cndiv/core` 的 `DIVISION_STATUS`，合法值 `active` / `deprecated` / `suspended`。
- `source_type`：`@cndiv/core` 的 `SOURCE_TYPE`，合法值 `official_nbs` / `mca_decree` / `community` / `shadow_map`。
- `confidence_score`：数值 0–100。

如需逐条展示校验错误，绕过 `validatePatch` 的字符串包装、直接取结构化 issues：

```ts
const r = PatchSchema.safeParse(data);
if (!r.success) for (const issue of r.error.issues) console.log(issue.path, issue.message);
```

> **返回形态不一致**：本包两个校验函数刻意不同——`validatePatch` 返回**自定义形状** `{ success, data } | { success, error: string }`（且 `error` 是 Zod 序列化串）；`validatePostalRecord` 返回 **Zod 原生 `SafeParseReturnType`**（`{ success, data } | { success, error: ZodError }`）。互相不能套用，按各自形状解构。

## Database

建表与写入的 SQL 字符串常量，供 migrate / build-source / hydrate 复用。

```ts
import { DATABASE_SCHEMA, INSERT_DIVISIONS_BATCH } from '@cndiv/data-protocol';

db.exec(DATABASE_SCHEMA); // 幂等：全部 CREATE TABLE / INDEX IF NOT EXISTS
```

`DATABASE_SCHEMA` 建三张表：

- **`divisions`**——区划主真相源。**复合主键 `(code, year)`**：同一区划码可跨多年并存（年份版本化）。列：`code, name, level, parent_code, year, status('active'), source_type, confidence_score, urban_rural_code`；附 `parent_code / year / level / source_type` 四个索引。
- **`metadata`**——`key` 主键的数据源标记表。
- **`patch_history`**——Patch 应用审计：`id, patch_file, applied_at, author, operations_count, notes`。

`INSERT_DIVISIONS_BATCH` 是 `INSERT OR REPLACE` 模板，**9 个 `?` 占位符**，顺序固定：

```
code, name, level, parent_code, year, status, source_type, confidence_score, urban_rural_code
```

```ts
stmt = db.prepare(INSERT_DIVISIONS_BATCH);
stmt.run(code, name, level, parentCode, year, status, sourceType, score, urbanRuralCode);
```

## Postal

邮编 + 长途区号是近静态地理参考数据，与 divisions 解耦，单列契约（由 `@cndiv/source-postal` 承载）。

```ts
import { validatePostalRecord, PostalRecordSchema, type PostalRecord } from '@cndiv/data-protocol';

const r = validatePostalRecord(row); // 返回 Zod 原生 SafeParse 结果
if (r.success) {
  const rec: PostalRecord = r.data;
} else {
  console.error(r.error.issues); // r.error 是 ZodError
}
```

`PostalRecordSchema` 字段：

| 字段 | 约束 |
| --- | --- |
| `province` | 非空（如 `北京市` / `广东省`） |
| `name` | 非空，区县级名（如 `东城区`） |
| `zip_code` | 6 位数字，正则 `^\d{6}$` |
| `area_code` | `0` 开头 3–4 位，正则 `^0\d{2,3}$`（如 `010` / `0755`） |

## CSV

divisions CSV **写入侧**的列契约与字段转义，统一 migrate / build-source / hydrate 三处写出。

```ts
import { DIVISIONS_CSV_HEADER, csvCell } from '@cndiv/data-protocol';
```

- `DIVISIONS_CSV_HEADER`——**8 列**表头（列顺序即写入顺序，与 `divisions` 表列对齐，不含换行）：

  ```
  code,name,level,parent_code,year,status,source_type,confidence_score
  ```

- `csvCell(value: string): string`——RFC4180 转义：双引号包裹、把 `"` 替换为 `""`（实际仅 `name` 字段需要）。

```ts
const line = [code, csvCell(name), level, parentCode, year, status, sourceType, score].join(',');
```

> 读取侧刻意不收口：crawler 差分手写解析 5 字段、cli 注水用 csv-parse 解析全 8 列——用途与依赖取向不同，故各自保留，本模块只统一写入侧。

## 示例

```bash
npx tsx packages/data-protocol/examples/validate-patch.ts
```

演示 `validatePatch` 守门：合法 patch（`add` + `update`，缺省 meta 字段被默认值填充）通过；非法 patch（`code` 非 12 位、`level` 越界）被拒，并示范如何从 `error` 取预览。

## License

MIT © [tonyc726](https://github.com/tonyc726)
