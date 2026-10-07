---
title: "@cndiv/reader"
---

# @cndiv/reader

只读打开 `cndiv hydrate` 生成的 `cache.db`。文件不存在会直接抛错，而不是返回空结果。

[npm](https://www.npmjs.com/package/@cndiv/reader) · 包内完整说明：[`packages/reader/README.md`](https://github.com/tonyc726/china-administrative-division/blob/master/packages/reader/README.md)

## 安装

```bash
npm i @cndiv/reader
cndiv hydrate --year=2023
```

依赖 `better-sqlite3`（带对应平台的预编译文件）。[注水](/guide/glossary#hydrate) 见 [快速上手](/guide/getting-started)。

## 方法

返回的记录是 `@cndiv/core` 的 `Division`：`code`、`name`、`level`、`parent_code`、`year`，以及可选的 `status`、`source_type`、`confidence_score`、`urban_rural_code`。数据库里的 NULL 会变成 `undefined`。

| 方法 | 返回 | 做什么 |
|---|---|---|
| `openCache(dbPath?)` | 查询器 | 默认 `~/.cndiv/cache.db`，只读 |
| `findByCode(code, year)` | `Division \| null` | 按码查某一年 |
| `findByName(name, year)` | `Division[]` | 精确匹配名称。没有索引，全表扫描 |
| `getChildren(parentCode, year, opts?)` | `Division[]` | 直接下级。`skipPlaceholder: true` 时跳过 [占位层](/guide/glossary#placeholder) |
| `getDescendants(code, year)` | `Division[]` | 全部后代，不含自己 |
| `getParent(code, year)` | `Division \| null` | 直接上级。省级是 `null` |
| `getAncestors(code, year)` | `Division[]` | 从省到直接上级，不含自己 |
| `getByLevel(level, year)` | `Division[]` | 某一年某一级的全部记录 |
| `getProvinces(year)` | `Division[]` | 全部省级 |
| `listYears()` | `number[]` | 库里有哪些年份，升序 |
| `close()` | `void` | 关闭连接 |

## 例子

```js
import { openCache } from '@cndiv/reader';

const cn = openCache();
console.log(cn.findByCode('110101000000', 2023));
cn.close();
```

```text
{
  code: '110101000000',
  name: '东城区',
  level: 3,
  parent_code: '110100000000',
  year: 2023,
  status: 'active',
  source_type: 'official_nbs',
  confidence_score: 100,
  urban_rural_code: undefined
}
```

列出北京市 16 个区的写法在 [常见用法](/guide/recipes)。

## 两个必须带上的条件

- **年份**。主键是 `(code, year)`。同一个码在 2015 和 2023 可以是不同的记录，漏掉年份会指错行。
- **占位层**。查直辖市的下级时，默认会停在「市辖区」上。要真实的区，传 `{ skipPlaceholder: true }`。
