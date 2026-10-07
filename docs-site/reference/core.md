---
title: "@cndiv/core"
---

# @cndiv/core

检查和拆开 12 位区划码。纯函数，零依赖，不读数据库，也不知道这个码的地名。查名称用 [`@cndiv/reader`](/reference/reader)。

[npm](https://www.npmjs.com/package/@cndiv/core) · 包内完整说明（npm 页面同源）：[`packages/core/README.md`](https://github.com/tonyc726/china-administrative-division/blob/master/packages/core/README.md)

## 安装

```bash
npm i @cndiv/core
```

只提供 ESM `import`。

## 函数

非法输入返回 `null` 或 `false`，不抛错。码的切分见 [12 位结构](/guide/glossary#code-12)。

| 函数 | 返回 | 做什么 |
|---|---|---|
| `validateCode(code)` | `boolean` | 必须是 12 位数字，且前 2 位是合法省码。**通过也不表示这个地方存在** |
| `normalizeCode(code)` | `string \| null` | 去掉非数字并补零到 12 位。不检查省码，补完还要再 `validateCode` |
| `getLevelFromCode(code)` | `1–5 \| null` | 看末尾有多少个 0，判断是省、市、县、乡还是村 |
| `getProvinceCode(code)` | `string \| null` | 前 2 位 |
| `getCityCode(code)` | `string \| null` | 前 4 位 |
| `getCountyCode(code)` | `string \| null` | 前 6 位 |
| `getTownshipCode(code)` | `string \| null` | 前 9 位 |
| `getParentCode(code, childLevel)` | `string \| null` | 上一级的 12 位码。`childLevel` 必须自己传入，函数不会先判级 |

常量：`DIVISION_LEVEL`（`PROVINCE=1` … `VILLAGE=5`）、`DIVISION_STATUS`、`SOURCE_TYPE`、`PROVINCE_CODES`（只有省码到省名，例如 `'11'` → `'北京市'`）。

## 例子

```ts
import { validateCode, getLevelFromCode, getParentCode, DIVISION_LEVEL } from '@cndiv/core';

validateCode('110101000000'); // true
validateCode('990101000000'); // false，99 不是省码
getLevelFromCode('110101000000'); // 3
getParentCode('110101000000', DIVISION_LEVEL.COUNTY); // '110100000000'
```

## 使用前

- 没有通用的「码 → 地名」。除了省级的 `PROVINCE_CODES`，名称都在数据包里。
- 没有 `getVillageCode`。村就是完整的 12 位。
- `getParentCode` 的第二个参数是**这个码自己的层级**。传错会得到错误的父码。先用 `getLevelFromCode`。
- `normalizeCode('990101')` 会得到 `'990101000000'`，但 `validateCode` 仍是 `false`。
