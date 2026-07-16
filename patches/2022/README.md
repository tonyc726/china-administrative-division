# patches/2022 · 无发布（县级调整冻结期）

本目录**无 `.json` patch 文件**，这是正常的，不是遗漏。

## 原因

2022 年民政部行政区划网站（xzqh.mca.gov.cn）**未发布县级以上行政区划变更条目**，属「县级调整冻结期」。xzqh 采集器对该年返回空结果（`[]`）而非抛错--此行为由 [`packages/crawler/src/xzqh.ts`](../../packages/crawler/src/xzqh.ts) 实现、[`packages/crawler/test/xzqh.test.ts`](../../packages/crawler/test/xzqh.test.ts) 固化（断言 2022 不在年度索引、页面无 `.tz_con` 内容时解析为空数组）。

> 「无发布」≠「零变更」。详见 [采集运维手册 §1](../../docs/采集运维手册.md)、[数据采集现状评估与提升路径](../../docs/数据采集现状评估与提升路径.md)。

## 若后续发现 2022 有需补的变更

经年度全量校准或民政部法令推演确认后，新增 `patches/2022/<变更>.json` 即可，CI 会自动校验（`scripts/validate-patches.mjs`）。
