# Patch 校验与交叉校验

`cndiv-verify`（`@cndiv/crawler`）对 patch 做 **schema 之上**的语义校验。分两档，边界由**确定性**与**合规**划定：

| 档 | 数据源 | 在哪跑 | 性质 | 状态 |
|---|---|---|---|---|
| **structural** | baseline CSV（官方）+ 码工具 | ✅ GitHub Actions（CI 门禁） | 离线、确定性、零合规风险 | ✅ 已实现 |
| **cross** | 高德/腾讯等商业地图 API | 🖥️ **仅本地维护者手动** | 在线、非确定性、合规灰区 | ⛔ 桩，故意未实现 |

## 为什么这样切分（First Principles + Inversion）

- **CI 门禁必须确定性可复现**：dmfw 反爬、无 SLA，商业源有配额/限速。任何联网校验都会让门禁**随机变红**，比没有门禁更糟。故 structural 完全离线——只读 `packages/source-2023/data/divisions.csv` 与 `@cndiv/core` 纯函数码工具。
- **合规红线不可穿**：高德/腾讯/百度/天地图四源 ToS **三重禁止**（存储 / 构建数据集 / 爬取分发，百度 3.3.4 最严明禁「生成或用于数据库」）。商业源**只可本地内部只读一致性校验、产物绝不落库、不进 `patches/`、不入 MIT 再分发**。因此严禁把商业 key 放进公开仓的 Actions。

## structural（CI 门禁）

```bash
# CI / 本地：对 patches/ 全量门禁
pnpm --filter @cndiv/crawler build
node packages/crawler/dist/run-verify.js --mode=structural \
  --patch=patches --baseline=packages/source-2023/data/divisions.csv

# 或开发期直接跑源码
pnpm --filter @cndiv/crawler verify -- --patch=patches/2025/xxx.json
# 无 baseline 只做纯码结构自洽（跳过引用完整性）
pnpm --filter @cndiv/crawler verify -- --patch=patches/xxx.json --baseline=off
```

**规则清单**（任一 `error` → 退出码 1 门禁不通过；`warning` 打印不阻断）：

| rule | 级别 | 含义 |
|---|---|---|
| `CODE_INVALID` | error | `code` 非合法 12 位区划码（结构/省码白名单）——schema 只查长度 |
| `ADD_LEVEL_MISMATCH` | error | `add.level` 与码结构派生 level 不符 |
| `ADD_PARENT_MISMATCH` | error | `add.parent_code` 与码结构派生父码不符（**dmfw 扁平父码 bug 的门禁点**，与 `normalize.canonicalizeParent` 同一不变量） |
| `ADD_DUPLICATE` | error | add 的码已存在于 baseline（重复新增） |
| `ADD_PARENT_MISSING` | warning | add 的父码不在 baseline 也未在本 patch 新增（悬挂父，可能跨 patch） |
| `TARGET_MISSING` | error | update/move/remove 的目标码不存在于 baseline 且非本 patch 新增 |
| `NEWPARENT_INVALID` | error | move/update 的 `new_parent` 非合法码 |
| `NEWPARENT_SELF` | error | `new_parent` 指向自身 |
| `NEWPARENT_MISSING` | warning | `new_parent` 悬挂 |
| `DUP_OP_CONFLICT` | error | 同码在本 patch 内既 add 又 remove（自相矛盾） |
| `DUP_OP` | warning | 同码在本 patch 内多次出现 |

CI 接线见 `.github/workflows/ci.yml` 的 `Verify patches (structural gate)` 步骤（紧随 schema 校验之后）。

## cross（本地手动，未实现）

当前 `cndiv-verify --mode=cross` 只打印合规说明并触发 `verifyCross()` 抛错，**不发起任何网络、不接入 CI**。

若未来要实现，**唯一合规形态**：

1. 仅在**维护者本机**手动触发，读本地 env 的 `AMAP_KEY` 等，**绝不进 Actions**。
2. 只做**只读一致性抽查**（存在性 / 父级），产物**写 stderr、绝不落盘**（不写文件、不进 `patches/`、不入任何 `source-*`）。
3. 受商业源**配额/QPS** 约束（高德个人版 ≈ QPS 3、5000/日），须**抽样 + 分片跨天**，不做全量对拍。
4. 定位为「发版前维护者手动过一眼」的告警信号，**非门禁**（退出码不阻断）。

> dmfw 官方源的**在线**回查（存在性再校验）性质同属"在线、非确定性"，未来若需要应作为 structural 的 `--online` **可选**增强，默认关闭，绝不进 CI 必过门禁。
