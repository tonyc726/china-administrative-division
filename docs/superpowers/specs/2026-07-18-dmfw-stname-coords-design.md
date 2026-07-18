# dmfw stname/listPub 坐标采集设计规格

> Date: 2026-07-18
> Author: Jiangfeng
> Status: 待评审
> Version: 0.1

## 一、定位与边界

本规格从 `2026-07-18-place-info-panel-design.md` 拆出，专门负责「政区坐标」数据的采集工程设计。place-info-panel 规格只消费坐标（`coords/`），不关心采集细节；本规格只产出坐标，不关心展示。

**不做什么**（边界）：
- 不采名称层级树（那是 `xzqh/getList` 的事，见 `packages/crawler/src/dmfw.ts`）
- 不采百科/面积/人口（那是 `baike.ts` 的事）
- 不采边界多边形（`pdm` 恒为 null，本接口只有点坐标）

## 二、接口契约

`stname/listPub`（国家地名信息库地名查询接口，站点 `dmfw.mca.gov.cn`）。

> ⚠️ 完整 URL 路径实现时确认（预计 `dmfw.mca.gov.cn/9095/stname/listPub` 或类似）。该接口属站点内部接口，官方 `interface.html` 未发布对外文档，与 crawler 现用的 `xzqh/getList` 同性质，非新增风险面。

| 项 | 值 |
|---|---|
| 方法 | **POST**（非 GET） |
| 必备头 | `User-Agent`（不带则 WAF 直接 403）；建议带 `Referer: https://dmfw.mca.gov.cn/`（与 `dmfw.ts:57` 一致） |
| `code` | **6 位**行政区划码（非 12 位、非 9 位，填错返回 total=0） |
| `size` | 上限 100 |
| `stName` | 可空；空 + `placeTypeCode` 可枚举某 code 下指定类型 |
| `placeTypeCode` | `21610`(行政村) / `21620`(社区) / `27610`(村民委员会) / `27620`(社区居委会) |

### 2.1 与 `xzqh/getList` 的差异（勿混用）

| | `xzqh/getList`（现有 `dmfw.ts`） | `stname/listPub`（本规格） |
|---|---|---|
| 方法 | GET | POST |
| code 位数 | 12 位定长 | 6 位 |
| 返回 | 行政区划树（code/name/level/type/children） | 地名记录（含坐标） |
| 坐标 | ❌ 无 | ✅ `gdm.coordinates` |
| 层级 | 到 level 4（乡镇），无村级 | 下探村级 |
| 抖动 | children 被截断 | total=0 |

### 2.2 响应字段（StnameRow）

```typescript
// packages/crawler/src/stname-types.ts

export interface StnameRow {
  name: string;
  /** 坐标 [lon, lat]，CGCS2000 体系，缺失率 0%（采样） */
  gdm: { coordinates: [number, number] };
  /** 边界面，恒为 null（只有点、无多边形） */
  pdm: unknown;
  /** 20 位地名库 place_code -- 弃用，不进产物 */
  place_code: string;
  /** 地名类型码，用于口径过滤 */
  placeTypeCode: string;
  /** 罗马字母（带声调），可选白送字段 */
  roman_alphabet_spelling?: string;
  /** 少数民族文字，可选白送字段 */
  ethnic_minorities_writing?: string;
}
```

## 三、稳定化策略（抖动治理）

`stname/listPub` 存在**非确定性抖动**：同参数随机返回 `total=0`（与 `xzqh/getList` 的 children 截断同病）。got 的 retry 对此无感（HTTP 200）。

策略（复用 `dmfw.ts:75` `unionChildren` 的思路，但算法不同）：

1. **重试直到非空**：同一 (code, placeTypeCode, page) 请求，`total=0` 时按指数退避重试，上限 N 次。
2. **交叉验证**：对关键级（县级）抽样二次请求，比对条目集合是否一致；不一致则再抓取取并集。
3. **不注入基线**：与 `unionChildren` 注释（`dmfw.ts:73`）一致--仅合并「同一次运行的多次 live 抓取」，绝不注入任何基线节点，防幽灵复活。

```typescript
// 伪码
async function fetchStnameStable(code: string, type: string): Promise<StnameRow[]> {
  for (let attempt = 0; attempt < MAX_JITTER_RETRY; attempt++) {
    const rows = await fetchStnamePage(code, type, /*page*/ 0);
    if (rows.length > 0) return rows; // 非 0 即收
    await sleep(backoff(attempt));
  }
  throw new StnameError(code, type, 'jitter: total=0 after retries');
}
```

## 四、口径过滤（27xxx 双登治理）

**问题**：`21610`(行政村) 与 `27610`(村民委员会)、`21620`(社区) 与 `27620`(社区居委会) 是**同一实体的双重登记**（21xxx=行政区域类，27xxx=单位法人类）。四者相加会算出 161% 的假覆盖率。实测同名记录坐标距离中位数 0m、最大 0m--确认是同一实体。

**正确口径**：仅取 `placeTypeCode` ∈ {`21610`, `21620`}，排除 `27610`/`27620`。

```typescript
const KEEP_TYPES = new Set(['21610', '21620']);
const filtered = rows.filter(r => KEEP_TYPES.has(r.placeTypeCode));
```

> 即便上游某次只返回 27xxx，也不保留--宁可漏（留空）也不双计。漏项由 `disclaimer` 兜底。

## 五、坐标系归一

- **存储统一 CGCS2000**：地名库站点底图为天地图（`t3.tianditu.gov.cn`，国家测绘），坐标为 CGCS2000、无 GCJ-02 偏移，`gdm.coordinates` 直接可用，不需解偏移。CGCS2000 ≈ WGS84（差异 <1m），存储按 WGS84 对待。
- **跳转高德时转 GCJ-02**：高德 URI API 接收 GCJ-02。转换在消费侧（`getAmapLink`，见 place-info-panel §7.4）完成，**存储侧不转**（保持原始 CGCS2000，避免偏移坐标污染其他用途）。

## 六、join 进项目 12 位码体系

地名库是**地名普查体系**，与项目法定区划代码（12 位扩展码）是两套东西。join 策略：

1. **弃用** `place_code`（20 位，地名库自有码），不进产物。
2. **按 name + 上级链匹配**项目 12 位码：县级直接按 6 位县级码匹配；乡村级按 `上级县码 + name` 匹配项目 `divisions` 中的 12 位码，匹配时复用 `packages/crawler/src/normalize.ts` 做名称归一（去「村/社区」后缀、繁简、全半角）。
3. **匹配失败的留空**：地名库覆盖 NBS level5 的 97.9% 是 8 县采样口径，join 后实际入库覆盖率会**低于** 97.9%（名称差异、同名异址）。留空项不臆造。

> **风险（诚实记录）**：村级 join 是本规格最大的不确定性。地名普查 name 与法定区划 name 存在系统性差异（如「XX村」vs「XX村民委员会」），join 损耗需首跑后实测量化，产物须标注 `confidence`。

## 七、分片输出

产物结构（与 place-info-panel §5.1 一致）：

```
apps/web/public/data/coords/
├── upper.json              # 省 + 市级坐标（~367 条，<30 KB）
└── shards/
    ├── 310115000000.json   # 浦东新区自身坐标 + 下辖所有乡村坐标
    └── ...                  # ~2979 个分片，按县级 12 位码命名（与现有 shards/ 同构）
```

- 省/市级量小，合并 `upper.json` 一次加载。
- 县级及以下按县级 12 位码分片，每分片 ~8-15 KB（~208 村/县 × ~40 字节）。加载某县信息时一次 fetch 拿到该县全部坐标。
- 命名与现有 `apps/web/public/data/shards/` 同构，便于前端按 code 定位分片。

## 八、断点续爬与缓存

复用 `packages/crawler/src/cache.ts` 的 `FsCache` 模式：

- 每个 (code, placeTypeCode) 的原始响应存一份 JSON，文件名 `${code}@${type}.json`（与 `FsCache.file` 的 `${code}@${maxLevel}` 后缀隔离思路一致）。
- 重跑时已抓取的读缓存、跳过网络，崩溃/中断无损续跑。
- **缓存的是原始响应**（含 27xxx），口径过滤在读取后做--便于口径规则调整时重算，无需重抓。
- 并发池与 BFS 遍历复用 `crawl-all.ts` 的 `crawlAll` 模式（逐层 + 并发池 + 断点续爬，见 `dmfw.ts:95` 注释）。

## 九、工作量估算

请求量按 stname 语义（查上级码批量枚举下级地名，`size=100`）：

| 范围 | 请求量 | 说明 |
|---|---|---|
| 乡村级坐标 | 2843 县码 × 2 类目 × ~2 页 ≈ 1.1–1.4 万 | 主导项，62 万乡村 / size 100 批量化 |
| 县级自身 | 333 市码 × ~1 页 ≈ 350 | 枚举县级 |
| 省/市级自身 | 34 省码 × ~1 页 ≈ 70 | 枚举省/市级 |
| 抖动重试 | ×1.2–1.3 | total=0 退避重试余量 |
| **合计有效请求** | **~1.4–1.8 万** | |

**时长**（地名库反爬比百度宽松，WAF 仅查 UA，可用并发 2-3、间隔 ~0.5-1s，非百科的 3s；并发上限需首跑试探 WAF 阈值）：

- 中性（并发 2-3，RTT ~350ms，含抖动重试）：**~1.5-2.5 小时**
- 乐观（并发 3，抖动低）：~1 小时
- 保守（并发 2，抖动高，重试多）：~3 小时

> **修正 v0.1 初稿**：初稿误标「县级 ~5-8 小时、村级数天」--未算清 `size=100` 的批量化（62 万数据点 ≈ 1.4 万请求，非 62 万请求），且把「查县码枚举乡村」错标为「县级坐标」。实际全量 **~1.5-2.5 小时**。与百科抓取（~2.7h）独立，断点续爬可分段完成，非一次性。

## 十、增量节律

地名库无变更事件流。按民政部令第 79 号（2025-09-01 施行）第十六条：国务院民政部门**每年 1 月**经 dmfw 发布截至上年末全级次代码。故坐标采用：

- **每年 1 月全量校准**一次（与区划代码年更节律对齐）。
- 日常不增量（地名普查数据年度级稳定，无日常变更信号）。

## 十一、合规

沿用 place-info-panel §3.1 的 **B+C 方案**，本规格不重复论证，仅执行约束：

- **B（衍生数据集）**：只取 `name` + 坐标，join 进项目 12 位码，弃 20 位 `place_code`，显著署名「中国·国家地名信息库」-> 论证为衍生数据集而非「原版原式转载」。
- **C（并行）**：经 `contact.html` 去函民政部确认可否用于开源再分发。
- **红线**：不原样打包地名库原始记录；产物每条带 `source: 'dmfw-stname'`。
- ⚠️ **残留冲突**：MIT 授予下游再分发超出上游权利（nemo dat），C 方案未回函前属「合理但非零风险」。

## 十二、验收

- [ ] **27xxx 未重复计数**：村级坐标总数 ≈ 62 万量级（非 161% 虚高），抽样核对同 name 不同 placeTypeCode 的记录已去重。
- [ ] **坐标系抽检**：随机 100 点，CGCS2000 存储值经 WGS84->GCJ-02 转换后高德定位偏差 < 50m（验证转换正确）。
- [ ] **抖动稳定**：全量抓取 total=0 的终态失败率 < 1%（重试后仍 0 才计失败）。
- [ ] **断点续爬**：中途 kill 后重跑，已抓 code 走缓存、未抓 code 续抓，无重复无遗漏。
- [ ] **join 损耗量化**：首跑后输出「地名库覆盖 vs join 入库」的覆盖率对照，村级 join 入库率实测记录。
- [ ] **口径可重算**：调整 `KEEP_TYPES` 后，从缓存重算产物无需重抓。

## 十三、代码影响

### 新增
- `packages/crawler/src/stname.ts` - `stname/listPub` 抓取器（请求原语 + 稳定化 + 口径过滤）
- `packages/crawler/src/stname-types.ts` - `StnameRow` 等类型
- `packages/crawler/src/run-stname.ts` - 运行入口（遵循 `run-*` 模式）
- `apps/web/scripts/build-coords.ts` - 分片产物构建

### 复用（不改）
- `packages/crawler/src/dmfw.ts` - `unionChildren` 思路、`fetchChildren` 的 got+UA+Referer+timeout+retry 请求模式
- `packages/crawler/src/cache.ts` - `FsCache` 断点续爬模式
- `packages/crawler/src/normalize.ts` - 名称归一（join 时）
- `packages/crawler/src/crawl-all.ts` - `crawlAll` 的 BFS+并发池+断点续爬

---

**变更日志：**
- 2026-07-18 v0.1：从 place-info-panel 规格拆出初稿。
