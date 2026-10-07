---
title: "@cndiv/data-protocol"
---

# @cndiv/data-protocol

[Patch](/guide/glossary#patch) 的格式校验，以及建表、写 CSV 时共用的字符串。普通查询用不到这个包。

[npm](https://www.npmjs.com/package/@cndiv/data-protocol) · 包内完整说明：[`packages/data-protocol/README.md`](https://github.com/tonyc726/china-administrative-division/blob/master/packages/data-protocol/README.md)

## 安装

```bash
npm i @cndiv/data-protocol
```

依赖 `zod` 和 `@cndiv/core`。

## 会用到的导出

| 导出 | 做什么 |
|---|---|
| `validatePatch(data)` | 检查一份未知 JSON 是不是合法 Patch。成功时 `{ success: true, data }`，失败时 `{ success: false, error }`。`error` 是校验器的原始 JSON，不是一句中文 |
| `DATABASE_SCHEMA` | 建 `divisions` / `metadata` / `patch_history` 的 SQL。`divisions` 的主键是 `(code, year)` |
| `DIVISIONS_CSV_HEADER` | CSV 表头：`code,name,level,parent_code,year,status,source_type,confidence_score` |
| `csvCell(value)` | 按 CSV 规则给单元格加引号 |
| `validatePostalRecord(row)` | 检查邮编和区号。返回值和 `validatePatch` 不一样，失败时 `error` 是 Zod 错误对象 |

操作类型是 `add`、`remove`、`update`、`move`。`code` 必须是 12 位。文件怎么写、撤销为什么优先用 `deprecated`，见 [贡献 Patch](/contributors/patch)。

## 例子

```ts
import { validatePatch } from '@cndiv/data-protocol';

const ok = validatePatch({
  meta: { author: 'docs-example' },
  operations: [
    { op: 'update', code: '310115005059', status: 'deprecated', note: '撤销合并' },
  ],
});
console.log(ok.success); // true
// 缺省字段会被填上：evidence_confidence = "medium"，apply_after = "2023-baseline"

const bad = validatePatch({
  meta: { author: 'docs-example' },
  operations: [{ op: 'update', code: '310115', status: 'deprecated' }],
});
console.log(bad.success); // false，code 不是 12 位
```
