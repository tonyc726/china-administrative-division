# 贡献 Patch

行政区划变更（撤县设区、更名、新设社区）写成 JSON 文件，放到 `patches/<年份>/`。[Patch](/guide/glossary#patch) 是官方不再公开发布全量之后，这份数据还能更新的方式。

## 文件长什么样

```jsonc
{
  "meta": {
    "author": "...",
    "source_url": "...",
    "evidence_confidence": "high",
    "apply_after": "2023-baseline"
  },
  "operations": [
    { "op": "add", "code": "310115001002", "name": "新设立社区居委会", "level": 5, "parent_code": "310115001000" },
    { "op": "update", "code": "310115102000", "status": "deprecated", "note": "撤销合并" }
  ]
}
```

- 常用 `add`（新增）和 `update`（更名或改状态）。撤销优先写成 `update`，并把 `status` 设为 `deprecated`，库里仍留着这条记录。协议也接受 `remove` 和 `move`，字段见 [`@cndiv/data-protocol`](/reference/data-protocol)。
- `code` 是 12 位，结构 `2+2+2+3+3`（见 [区划码](/guide/glossary#code-12)）。
- `meta.evidence_confidence` 取 `high` / `medium` / `low`。

## 提交前先在本地检查

```bash
node scripts/validate-patches.mjs
```

结构和「这个码在基准年里是否存在」：

```bash
cndiv-verify structural --patch=patches/2025/xxx.json
```

校验和商业地图对照的边界见 [Patch 校验](/ops/patch-verify)。

## 提交流程

1. 按公开公告（民政部，或省、市政府门户）在 `patches/<变更年份>/` 新建 JSON。
2. `meta.source_url` 指向公告原文。
3. 本地 `node scripts/validate-patches.mjs` 通过后发 PR。
4. CI 再查一遍，维护者核对证据后合入。

## 维护者：合上数据闭环

```text
采集 → patches/<年份>/ → apply-patch（写到目标年）
     → backfill 导回 source-<年份>/divisions.csv → 重新发包
```

年度全量和日常增量见 [采集运维手册](/ops/crawl-runbook)。
