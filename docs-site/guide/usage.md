# 在代码中使用

四个面向消费者的代码包，按需安装：

| 我想… | 用 | 入口 |
|---|---|---|
| 校验/解析 12 位区划码（判级、取父码、补零） | [`@cndiv/core`](/reference/core) | 纯函数零依赖 |
| 校验社区 Patch / 复用 SQLite schema | [`@cndiv/data-protocol`](/reference/data-protocol) | `validatePatch` / `DATABASE_SCHEMA` |
| 命令行注水、应用 patch、导出 | [`@cndiv/cli`](/reference/cli) | `cndiv` 命令 |
| 在 JS 里查询注水后的区划数据 | [`@cndiv/reader`](/reference/reader) | `openCache().findByCode(...)` |

## 码工具（`@cndiv/core`，纯函数）

```ts
import { validateCode, getLevelFromCode, getParentCode, DIVISION_LEVEL } from '@cndiv/core';

validateCode('310115000000');                          // true（结构 + 省码白名单，不保证真实存在）
getLevelFromCode('310115000000');                      // 3 (COUNTY)
getParentCode('310115000000', DIVISION_LEVEL.COUNTY);  // '310100000000'
```

::: tip 完整 API 参考
16 个导出的全清单与已知边界（无「码→名」反查、`normalizeCode` 不校验省码、`getParentCode` 需先判级等）见 [`@cndiv/core` 参考](/reference/core)。可跑示例：`npx tsx packages/core/examples/code-tools.ts`。
:::

## 查询注水后的数据（`@cndiv/reader`）

`cndiv hydrate` 把数据落到 `~/.cndiv/cache.db`（标准 SQLite）。用 [`@cndiv/reader`](/reference/reader) 查询——它薄封装 `better-sqlite3`、只读打开，并自动屏蔽两个坑：**复合主键 `(code, year)`**（所有查询强制 `year`）与**直辖市「市辖区」占位层**（`skipPlaceholder` 穿透到真实区县）。

```ts
import { openCache } from '@cndiv/reader';

const cn = openCache(); // 默认 ~/.cndiv/cache.db，只读
cn.findByCode('110101000000', 2023);                            // → Division（东城区）
cn.getChildren('110000000000', 2023, { skipPlaceholder: true }); // → [东城区, 西城区]
cn.getDescendants('110000000000', 2023);                        // 递归全部后代
cn.close();
```

::: tip 也可直接写 SQL
不用 reader、自带 `better-sqlite3` 直接写 SQL 亦可——reader 即此封装。底层查询范式（点查 / 子级 / 递归 CTE / 配合 `@cndiv/core` 码工具）见可跑示例：`npx tsx packages/cli/examples/query-cache.ts`。
:::

## 校验 Patch（`@cndiv/data-protocol`）

```ts
import { validatePatch } from '@cndiv/data-protocol';

const r = validatePatch(JSON.parse(patchJson));
if (!r.success) throw new Error(r.error); // success 为 true 时 r.data 是规范化后的 Patch
```

可跑示例：`npx tsx packages/data-protocol/examples/validate-patch.ts`。
