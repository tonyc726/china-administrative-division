# 仓库优化方案（2026-09，三轮评审后定稿）

## 背景

2026-09 对仓库做了 tree 分析 → 第一性原理评审 → 对抗式辩论三轮评审。
每轮规律：**被核实过的结论都幸存，未被核实的都被推翻**（netlify/vercel 未查 CI、
workspace 未读注释、merged.conflicts 未读文件，三处断言均被推翻）。

## 原则

每项改动必须命中 正确性 / 可复现性 / 唯一真相源 之一，且成本与 solo 维护预算匹配。

## 阶段 0：战略调研（优先级最高，先于一切代码改动）

**课题：dmfw 村级覆盖率 vs NBS 2023 基线——项目最大未对冲风险。**

- 背景：modood（同类最大项目）停更于 2023-09，与「NBS 村级统计表停发」传闻吻合；
  本项目 64 万村庄数据的唯一基线是 NBS 2023 快照；dmfw 村级长期供给能力未验证。
- 方法：抽样 5–8 个代表性省份，dmfw 村级数据 vs `NBS.2023.sqlite` village 表对比。
- 指标：村级条目覆盖率、码段结构一致性、增删差异量。
- 决策树：覆盖良好 → 规划村级增量管线；覆盖差 → 村级数据显式标注为
  「冻结于 2023 的历史快照」，README/数据字典如实声明，不做无源之水的推演。

## 阶段 1：PR-A 真相源修正（零行为变更）

| # | 改动 | 理由 |
|---|---|---|
| A1 | 删除 `claude/DESIGN.md` | 与根 `DESIGN.md` 双真相源、漂移 17 行、零引用 |
| A2 | 修正 `pnpm-workspace.yaml` legacy 注释 | 「文件仍在 git 供考古」与 legacy/data 0 文件入库的现实不符 |
| A3 | 本地清理 `packages/crawler/packages/`（15M 误装残留，不进 commit） | 误嵌套安装残留 |

## 阶段 2：PR-B 三条部署通道全部可复现

| # | 改动 |
|---|---|
| B1 | `docs-site/.gitignore` 删 `pnpm-lock.yaml` 行，锁文件入库 |
| B2 | `pages.yml` 两处 install 加 `--frozen-lockfile` |
| B2' | `netlify.toml`、`vercel.json` 的 buildCommand 同步加 `--frozen-lockfile`（保留即须同等可复现） |
| B3 | 安全 overrides（postcss / nanoid@3 / brace-expansion）同步进两个嵌套 workspace，刷新 lockfile |
| B4 | `ci.yml` 补两个嵌套 workspace 的 `pnpm audit`（先本地跑，无存量漏洞再定 low 等级） |

验收：本地两子 workspace `--frozen-lockfile` install + build 通过；合并后盯 pages.yml 首跑。

## 阶段 3：低成本改进（阶段 0 结论之后做）

| # | 改动 | 边界 |
|---|---|---|
| C1 | source-* 年度包版本号绑上游周期（`2026.1.0` 式），写入 PUBLISHING.md | 只绑年度，不绑 1/7 月双节奏；recalibration reminder 保持提醒属性，不升级为 SLA |
| C2 | 变迁推导层：从相邻年度 patch 推导 supersession 候选视图 | 只读实验产物，不进 data-protocol / cold master schema |

## 明确不做（对抗评审淘汰，防止复活）

| 项 | 死因 |
|---|---|
| 嵌套 workspace 并入根 | 与三处文档记录的有意设计对抗（前端依赖不进 monorepo lockfile） |
| WOF 生命周期字段进协议 | v3 级迁移成本远超收益；C2 是 90% 效果 10% 成本的替代 |
| Concordance 对外数据产品 | 零需求证据；收敛表作为内部校验夹具自然存在即可 |
| 「上游收缩是机会」叙事 | 信源自相矛盾；真相是上游分化，风险待阶段 0 核实 |
| 裁剪 .gitignore、合并 docs/plans 目录 | 零正确性收益的审美洁癖 |
| 删除 netlify.toml / vercel.json | 已核实为文档化的 fork 部署通道，保留（2026-09 决策） |

## 遗留项

1. legacy 本地 114M：`cndiv migrate` 迁移完整性验证后清理。
2. 本地 268M 构建产物（apps/web/dist + public/data）：可再生，省磁盘时清。
