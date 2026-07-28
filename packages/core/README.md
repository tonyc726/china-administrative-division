# @cndiv/core

> 中国行政区划的核心类型与 12 位区划码算法：纯函数、零依赖、不碰数据库。

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

## 定位

本包只做两件事：**类型定义** + **码的纯计算**（校验 / 归一化 / 判级 / 逐级拆码 / 构造父码）。全部为纯函数，无 I/O、不读数据库、不查名称——是整个 Monorepo 的最底层地基。需要「码 ↔ 名」或区划数据请用上层的 SQLite 数据包。

## 安装

```bash
npm i @cndiv/core
```

纯 ESM（`"type": "module"`），仅支持 `import`，**不提供 CommonJS `require`**。

## 区划码结构（GB/T 2260，国家统计局 12 位）

```
PP CC DD TTT VVV   ← 2 + 2 + 2 + 3 + 3 = 12 位
│  │  │  │   └─ 村/居委会  Village
│  │  │  └───── 乡/镇/街道 Township
│  │  └──────── 县/市辖区  County
│  └─────────── 地级市     City
└────────────── 省         Province
```

**判级靠尾零启发式**——某层级以下全为 `0` 即视为该层级：

| 层级 | DivisionLevel | 形态 | 示例 |
| --- | --- | --- | --- |
| 省 Province | 1 | `PP` + 10 个 0 | `110000000000` |
| 市 City | 2 | `PPCC` + 8 个 0 | `110100000000` |
| 县 County | 3 | `PPCCDD` + 6 个 0 | `110101000000` |
| 乡镇 Township | 4 | `PPCCDDTTT` + 3 个 0 | `110101001000` |
| 村 Village | 5 | 完整 12 位 | `110101001001` |

## 用法

### 码工具（8 个纯函数，非法输入一律返回 `null` / `false`）

```ts
import {
  validateCode,
  normalizeCode,
  getLevelFromCode,
  getProvinceCode,
  getCityCode,
  getCountyCode,
  getTownshipCode,
  getParentCode,
} from '@cndiv/core';

// 校验：仅约束「^\d{12}$ + 前 2 位为合法省码」，不保证该码真实存在
validateCode('110101000000'); // true
validateCode('990101000000'); // false（99 非合法省码）
validateCode('11010100000');  // false（11 位）

// 归一化：补零到 12 位（不校验省码，须再过一遍 validateCode）
normalizeCode('110101');      // '110101000000'

// 判级（尾零启发式）
getLevelFromCode('110101001001'); // 5（VILLAGE）

// 逐级前缀拆码
getProvinceCode('110101001001'); // '11'
getCityCode('110101001001');     // '1101'
getCountyCode('110101001001');   // '110101'
getTownshipCode('110101001001'); // '110101001'（9 位 = 2+2+2+3，非 8 位）

// 构造父码：childLevel 必须由调用方传入（函数不自动判级！）
const lvl = getLevelFromCode('110101000000'); // 3（COUNTY）
if (lvl !== null) getParentCode('110101000000', lvl); // '110100000000'（向上一级 → 市）
```

签名速查：

```ts
validateCode(code: string): boolean
normalizeCode(code: string): string | null
getLevelFromCode(code: string): DivisionLevel | null
getProvinceCode(code: string): string | null
getCityCode(code: string): string | null
getCountyCode(code: string): string | null
getTownshipCode(code: string): string | null
getParentCode(code: string, childLevel: DivisionLevel): string | null
```

### 类型与常量（8 个）

```ts
import {
  type Division,
  type DivisionLevel,   DIVISION_LEVEL,
  type DivisionStatus,  DIVISION_STATUS,
  type SourceType,      SOURCE_TYPE,
  PROVINCE_CODES,
} from '@cndiv/core';
```

`Division`——对齐 SQLite schema 的核心接口，**字段为 snake_case**：

```ts
interface Division {
  code: string;                  // 12 位区划码
  name: string;
  level: DivisionLevel;          // 1-5
  parent_code: string | null;    // 省级为 null
  year: number;
  status?: DivisionStatus;
  source_type?: SourceType;
  confidence_score?: number;     // 0-100，100 = 官方
  urban_rural_code?: string;     // 遗留字段：城乡分类码（2024 起弃用）
}
```

| 常量 | 取值 |
| --- | --- |
| `DIVISION_LEVEL` | `PROVINCE=1` `CITY=2` `COUNTY=3` `TOWNSHIP=4` `VILLAGE=5` |
| `DIVISION_STATUS` | `ACTIVE='active'` `DEPRECATED='deprecated'` `SUSPENDED='suspended'` |
| `SOURCE_TYPE` | `OFFICIAL_NBS`（国家统计局，最高置信）`MCA_DECREE`（民政部公报）`COMMUNITY`（社区贡献）`SHADOW_MAP`（商业地图推断，最低置信） |
| `PROVINCE_CODES` | `Record<string,string>`，省码（前 2 位）→ 省名，如 `'11' → '北京市'` |

对应的 `DivisionLevel` / `DivisionStatus` / `SourceType` 均为从常量推导的字面量联合类型。

## 已知边界（首次使用必看）

**码→名反查**
没有通用「码 → 名」反查——全库唯一的码转名能力是 `PROVINCE_CODES`，且**仅到省级**。市/县/乡/村的名称需查上层数据包。

**村级即完整码**
没有 `getVillageCode`——村级即完整 12 位码本身，无需再拆前缀。

**`getParentCode` 不自动判级**
第二参 `childLevel` 是「传入码自身的层级」，须先用 `getLevelFromCode` 求出再传；传错层级会得到错误父码。

**`normalizeCode` 不校验省码**
它只做去非数字 + 补零（长度须在 2~12 之间，否则返回 `null`）。如 `'990101'` 会被补成 `'990101000000'`，但这不是合法码，务必再过一遍 `validateCode`。

**`validateCode` 只验结构 + 省码白名单**
通过不代表该码在现实中真实存在。

**纯 ESM**
只能 `import`，无 `require`。

## 示例

```bash
npx tsx packages/core/examples/code-tools.ts
```

## License

MIT © [tonyc726](https://github.com/tonyc726)
