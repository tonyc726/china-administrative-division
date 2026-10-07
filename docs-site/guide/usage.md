# 在代码中使用

可以复制运行的例子在 [常见用法](/guide/recipes)。名词在 [术语表](/guide/glossary)。

| 我想… | 安装 | 入口 |
|---|---|---|
| 检查、补零、判断 12 位码是哪一级 | [`@cndiv/core`](/reference/core) | 纯函数，不读数据库 |
| 在 JS 里查已经装好的数据 | [`@cndiv/reader`](/reference/reader) | `openCache().findByCode(...)` |
| 用命令装数据、导出 CSV | [`@cndiv/cli`](/reference/cli) | `cndiv` |
| 检查一份 [Patch](/guide/glossary#patch) 的格式 | [`@cndiv/data-protocol`](/reference/data-protocol) | `validatePatch` |

## 拆码（`@cndiv/core`）

它只处理数字本身，不知道这个码叫什么名字。

```ts
import { validateCode, getLevelFromCode, getParentCode, DIVISION_LEVEL } from '@cndiv/core';

validateCode('110101000000');                          // true（格式和省码，不保证这个地方存在）
getLevelFromCode('110101000000');                      // 3（县 / 区）
getParentCode('110101000000', DIVISION_LEVEL.COUNTY);  // '110100000000'
```

边界和完整函数表见 [`@cndiv/core`](/reference/core)。

## 查询（`@cndiv/reader`）

`cndiv hydrate` 之后打开 `~/.cndiv/cache.db`。每次查询都要带年份。直辖市要跳过 [市辖区占位层](/guide/glossary#placeholder)。

```ts
import { openCache } from '@cndiv/reader';

const cn = openCache();
cn.findByCode('110101000000', 2023);                             // 东城区
cn.getChildren('110000000000', 2023, { skipPlaceholder: true }); // 16 个区
cn.close();
```

也可以自己写 SQL。表结构见 [区划码与表结构](/reference/data-model)。

## 检查 Patch（`@cndiv/data-protocol`）

```ts
import { validatePatch } from '@cndiv/data-protocol';

const r = validatePatch(JSON.parse(patchJson));
if (!r.success) throw new Error(r.error);
```

`r.error` 是校验器的原始 JSON，不是一句中文说明。文件怎么写见 [贡献 Patch](/contributors/patch)。
