# 贡献 Patch

行政区划变更（撤县设区、更名、新设社区等）以 JSON Patch 提交到 `patches/<YYYY>/`。这是 v2 在官方停更后持续更新数据的核心机制。

## Patch 格式

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

- `op`：`add` / `update`（`remove` 语义通过 `status: deprecated` 表达，保留可追溯性）。
- `code`：12 位区划码，结构 `2+2+2+3+3`（见 [数据模型](/reference/data-model)）。
- `meta.evidence_confidence`：证据置信度，映射到来源置信度分档。

## 校验与门禁

提交后 CI（`validate-patches.yml`）会用 `validatePatch` 自动校验。本地先自查：

```bash
node scripts/validate-patches.mjs
```

进一步的结构性门禁（码/层级/父级自洽 + baseline 引用完整性，离线确定性）：

```bash
cndiv-verify structural --patch=patches/2025/xxx.json
```

Patch 校验与商业地图交叉校验的边界，见 [Patch 校验与交叉校验](/ops/patch-verify)。

## 提交流程

1. 依据公开公告（民政部/省级/市级政府门户）在 `patches/<变更年份>/` 新建 JSON 文件。
2. 填写 `meta.source_url` 指向公告原文，根据证据强度选择 `evidence_confidence`（`high` / `medium` / `low`）。
3. 本地运行 `node scripts/validate-patches.mjs`，通过后提交 PR。
4. CI 自动校验，维护者审核证据链后合入。

## 维护者：数据闭环

```
crawler 抓取 → patches/<YYYY>/ → apply-patch（克隆到目标年）
             → backfill 导回 source-<year>/divisions.csv → 重建数据包
```

维护者采集运维（年度全量校准 + 日常 xzqh 事件增量、产物合并、level 5 村级冻结边界）见 [采集运维手册](/ops/crawl-runbook)。
