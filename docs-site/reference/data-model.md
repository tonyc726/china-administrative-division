# 区划码结构与数据模型

## 12 位统计用区划代码结构 2+2+2+3+3

```
11      01      01      001       001
省(2)   市(2)   县(2)   乡镇(3)   村(3)
```

| 级 | 位段 | 语义 | `DIVISION_LEVEL` |
|---|---|---|---|
| 1 | 省(2) | 省/自治区/直辖市 | `PROVINCE` |
| 2 | +市(2) | 地级市/地区/州/盟 | `CITY` |
| 3 | +县(2) | 县/区/县级市 | `COUNTY` |
| 4 | +乡镇(3) | 乡/镇/街道 | `TOWNSHIP` |
| 5 | +村(3) | 村委会/居委会 | `VILLAGE` |

码工具（判级、取父码、补零）见 [`@cndiv/core`](/reference/core)。

<LevelScaleChart />

## 存储范式：扁平邻接表

存储为扁平邻接表，复合主键 `(code, year)` 支持同一区划码跨年份版本化：

```sql
divisions(
  code,              -- 12 位区划码
  name,
  level,             -- 1..5
  parent_code,       -- 邻接表：指向父级 code
  year,              -- 版本维度，与 code 组成复合主键
  status,            -- active / deprecated ...
  source_type,       -- 来源置信度分档（见下）
  confidence_score
)
-- PRIMARY KEY (code, year)
```

完整 `DATABASE_SCHEMA`（Zod 单一真相源）见 [`@cndiv/data-protocol`](/reference/data-protocol)。

## 来源置信度分档

每条数据带来源类型，回答「这条记录从哪来、可信度多高」。置信度由高到低 4 档：

| 档位 | `source_type` | 含义 |
|---|---|---|
| 最高 | `official_nbs` | 国家统计局原始发布，置信度 100 |
| 高 | `mca_decree` | 民政部令/公报等权威公告 |
| 中 | `community` | 社区贡献 Patch（经人工核证） |
| 低 | `shadow_map` | 商业地图推断（仅内部校验，不入 MIT 分发） |

## 两个必须知道的坑

1. **复合主键 `(code, year)`**：任何点查都要带 `year`，否则跨年份多条会歧义。[`@cndiv/reader`](/reference/reader) 已强制。
2. **直辖市「市辖区」占位层**：北京/上海等在 市→区 之间有一层「市辖区」占位。reader 的 `skipPlaceholder` 可穿透到真实区县。

## 编制规则（官方口径）

- [统计用区划代码编制规则](/ops/rule-nbs)
- [县以下区划代码编制规则](/ops/rule-sub-county)
