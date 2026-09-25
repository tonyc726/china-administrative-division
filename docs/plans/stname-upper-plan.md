# run-stname upper 采集与接入计划（分阶段 / 可中断续跑）

## 目标

补齐 `apps/web/public/data/coords/upper.json` 的省、市、县级自身坐标。
当前 `upper.json` 是占位符：

```json
{"note":"gap:run-stname 仅抓县级下村级(21610/21620),省/市级自身坐标未采集。待扩展 run-stname 后填充。","provinces":[],"cities":[]}
```

## 数据源

`stname/listPub` 按 `place_type_code` 提供行政区划点坐标：

| 类型码 | 含义 | 数量 | 请求数 |
|--------|------|------|--------|
| 21200 | 省级行政区 | 34（含港澳台） | 1 |
| 21300 | 地级行政区 | 334 | 4 |
| 21400 | 县级行政区 | 2849 | 29 |
| 21500 | 乡级行政区 | 38798 | 跳过（已有 21610/21620 村级更细） |

upper 合计约 3217 条，34 个请求，几分钟可跑完。

## 关键约束（探针发现）

1. **必须按 province code（2 位）分别查询**。nationwide 空 code 查询 21400 虽然 `total=2849`，但不同页会随机缺失某些县（如北京东城/西城/朝阳等在前 1000 条里没有，分散在后面页）。按省份查可保证完整。

2. **直辖市没有 21300 记录**——北京/天津/上海/重庆在 21200（省级）和 21400（县级）存在，地级层级本身不存在。`upper.json` 的 `cities[]` 只收录真实地级行政区。

3. **21400 存在 6 位县级码冲突**，去重不能只看 6 位码，必须按完整 9 位码 + 名称 + `place_type_code` 匹配：
   - 河北廊坊 `131003` 同时对应「安次区」（`131003999`）和「广阳区」（`131003003`）
   - 浙江温州 `330327` 同时对应「苍南县」（`330327999`）和「龙港市」（`330327123`）
   - 安徽六安 `341522` 同时对应「霍邱县」（`341522999`）和「叶集区」（`341522121`）
   - 山东潍坊 `370705` 同时对应两个「奎文区」（一个 `type=21300` 误标、一个 `type=21400`）

4. **雄安新区在 21300 中作为独立地级行政区出现**，与保定市共用 `1306` 前缀，`build-coords` 匹配时要按名称区分。

5. **县级 21400（2849）比 NBS 2023 L3（2975）少 126 条**，缺失的主要是各类开发区/新区/管理区/管委会。这些是 NBS 有但地名库没有的，`build-coords` 以「未匹配」如实记录，不臆造。

## 分阶段实现（每阶段独立可提交，支持强制中断后续跑）

### 阶段 1：采集 upper 数据

- 扩展 `packages/crawler/src/run-stname.ts`：新增 `--upper` 模式
- 按 31 个 NBS 省份 code 分别抓取 21200 / 21300 / 21400
- 产物输出到 `packages/crawler/.cache/upper.json`
- **断点续跑机制**：
  - `upper.json` 内记录每个 `(provinceCode, placeTypeCode)` 的完成状态
  - 每完成一个类型写一次原子文件（tmp + rename）
  - 重跑时跳过已标记完成的 `(provinceCode, type)` 对
  - kill / 崩溃后重新执行 `pnpm --filter @cndiv/crawler crawl:stname -- --upper` 即可续跑
- 记录统计：province / city / county 条数、去重前后、缺失说明
- 验收：`.cache/upper.json` 含 31 省 + 334 市 + 2849 县坐标

### 阶段 2：build-coords 接入 upper

- 扩展 `apps/web/scripts/build-coords.ts`：读 `packages/crawler/.cache/upper.json`
- 按名称把 21200 / 21300 / 21400 匹配到 NBS 2023 的 L1 / L2 / L3 12 位码
- 21400 的 6 位码冲突按完整 9 位 `place_code` 解析后再按名称匹配
- 输出 `apps/web/public/data/coords/upper.json` 的 `provinces[]` / `cities[]` / `counties[]`
- 更新 `join-report.json`：新增 upper 匹配统计（ matched / unmatched / duplicate-code ）
- **降级**：`upper.json` 不存在时保持现有占位，不阻断 CI
- 验收：`build-coords` 产物中的 `upper.json` 不再是占位符

### 阶段 3：InfoPanel 显示省/市/县坐标

- 扩展 `apps/web/src/components/InfoPanel.tsx`
- 当前仅处理 `leaf.level === 5`（村级）
- 为 L1 / L2 / L3 增加 `upper.json` 读取逻辑
- L4（乡级）仍无数据源，保持降级隐藏
- 验收：点击省/市/县节点时面板出现坐标与高德链接

### 阶段 4：文档与记忆

- 更新 `memory/dmfw-stname-coords.md`：记录 upper 采集完成、数据口径、已知缺失
- 更新本计划文件状态（勾选验收项）
- 验收：记忆文件与本计划状态一致

## 全局验收

- [x] 阶段 1：`packages/crawler/.cache/upper.json` 含 31 省 + 334 市 + 2849 县坐标
- [x] 阶段 2：`build-coords` 输出 `apps/web/public/data/coords/upper.json`
  - 实测（2026-09-25）：31 省 + 333 市 + 2839 县；未匹配 C:1（雄安新区 NBS 无节点）K:9（三沙两区/两江新区/和安县/和康县等 2024 新设 + 3 条地名库噪声）；重复码 K:1（奎文区缓存残留，输出按码去重吸收）；NBS 未覆盖 L2:9 L3:136（开发区/新区/管委会）
  - 按省查询的产物中计划预言的 6 位码冲突（安次/广阳、苍南/龙港、霍邱/叶集）实际各自持有正确 9 位码，直接精确匹配；仅武宁县（area 误标 360400999）走了市域名称兜底
- [ ] 阶段 3：`InfoPanel` 在省/市/县级显示坐标与高德链接
- [ ] 阶段 4：乡级仍无坐标，降级隐藏；记忆文件更新

## 续跑命令

```bash
# 阶段 1 中断后续跑
pnpm --filter @cndiv/crawler crawl:stname -- --upper

# 阶段 2（upper.json 已生成后）
bun apps/web/scripts/build-coords.ts

# 阶段 3 完成后验证
pnpm --filter @cndiv/web typecheck
pnpm --filter @cndiv/web build
```
