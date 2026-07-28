# 中国行政区划数据库说明文档

## 概述

本项目包含两套行政区划数据，均为历年数据快照：

| 数据集 | 数据来源 | 文件命名 | 年份范围 |
|--------|----------|----------|----------|
| GB2260 | 国家统计局（GB/T 2260 国标） | `GB2260.{year}.sqlite` | 1980-2023 |
| NBS | 国家统计局统计数据库 | `NBS.{year}.sqlite` | 2009-2023 |

---

## Schema 对比

### GB2260.*.sqlite (3级结构)

```
province (省级)
├── code: VARCHAR(255) PRIMARY KEY  -- 6位代码，如 "110000"
└── name: VARCHAR(255)              -- 名称，如 "北京市"

city (市级)
├── code: VARCHAR(255) PRIMARY KEY  -- 6位代码，如 "110100"
├── name: VARCHAR(255)              -- 名称，如 "市辖区"
└── provinceCode: VARCHAR(255)      -- 关联省级代码，外键

county (县级)
├── code: VARCHAR(255) PRIMARY KEY  -- 6位代码，如 "110101"
├── name: VARCHAR(255)              -- 名称，如 "东城区"
├── cityCode: VARCHAR(255)          -- 关联市级代码，外键
└── provinceCode: VARCHAR(255)      -- 关联省级代码，外键
```

### NBS.*.sqlite (5级结构)

```
province (省级)
├── code: VARCHAR(255) PRIMARY KEY  -- 6位代码，如 "110000"
└── name: VARCHAR(255)              -- 名称，如 "北京市"

city (市级)
├── code: VARCHAR(255) PRIMARY KEY  -- 6位代码，如 "110100"
├── name: VARCHAR(255)              -- 名称，如 "市辖区"
└── provinceCode: VARCHAR(255)      -- 关联省级代码，外键

area (县级/区级)
├── code: VARCHAR(255) PRIMARY KEY  -- 6位代码，如 "110101"
├── name: VARCHAR(255)              -- 名称，如 "东城区"
├── cityCode: VARCHAR(255)          -- 关联市级代码，外键
└── provinceCode: VARCHAR(255)      -- 关联省级代码，外键

street (乡级/镇级/街道)
├── code: VARCHAR(255) PRIMARY KEY  -- 9位代码，如 "110101001"
├── name: VARCHAR(255)              -- 名称，如 "东华门街道办事处"
├── areaCode: VARCHAR(255)          -- 关联县级代码，外键
├── provinceCode: VARCHAR(255)      -- 关联省级代码，外键
└── cityCode: VARCHAR(255)          -- 关联市级代码，外键

village (村级)
├── code: VARCHAR(255) PRIMARY KEY  -- 12位代码，如 "110101001001"
├── name: VARCHAR(255)              -- 名称，如 "多福巷社区居委会"
├── streetCode: VARCHAR(255)        -- 关联乡级代码，外键
├── provinceCode: VARCHAR(255)      -- 关联省级代码，外键
├── cityCode: VARCHAR(255)          -- 关联市级代码，外键
└── areaCode: VARCHAR(255)          -- 关联县级代码，外键
```

---

## 数据量统计 (2023年)

| 层级 | GB2260 | NBS | 说明 |
|------|--------|-----|------|
| 省 | 34 | 31 | NBS 不含台港澳 |
| 市 | 333 | 342 | NBS 包含更多市辖区 |
| 县 | 2,842 | 2,978 | NBS 包含更多县级单位 |
| 乡/镇 | - | 41,352 | 仅 NBS 有 |
| 村/社区 | - | 620,573 | 仅 NBS 有 |

### 各年份数据量

#### GB2260

| 年份 | 省 | 市 | 县 |
|------|----|----|-----|
| 1980 | 29 | 316 | 2,761 |
| 1981 | 29 | 316 | 2,772 |
| 1982 | 29 | 319 | 2,793 |
| 1983 | 29 | 321 | 2,775 |
| 1984 | 29 | 323 | 2,813 |
| 1985 | 29 | 327 | 2,825 |
| 1986 | 29 | 324 | 2,831 |
| 1987 | 29 | 326 | 2,826 |
| 1988 | 30 | 334 | 2,830 |
| 1989 | 30 | 336 | 2,829 |
| 1990 | 30 | 336 | 2,833 |
| 1991 | 30 | 338 | 2,833 |
| 1992 | 30 | 339 | 2,833 |
| 1993 | 30 | 335 | 2,835 |
| 1994 | 30 | 333 | 2,845 |
| 1995 | 30 | 334 | 2,849 |
| 1996 | 30 | 335 | 2,858 |
| 1997 | 31 | 332 | 2,862 |
| 1998 | 31 | 331 | 2,863 |
| 1999 | 31 | 331 | 2,858 |
| 2000 | 31 | 333 | 2,861 |
| 2001 | 31 | 332 | 2,861 |
| 2002 | 31 | 332 | 2,860 |
| 2003 | 31 | 333 | 2,861 |
| 2004 | 31 | 333 | 2,862 |
| 2005 | 31 | 333 | 2,862 |
| 2006 | 31 | 333 | 2,860 |
| 2007 | 31 | 333 | 2,859 |
| 2008 | 31 | 333 | 2,859 |
| 2009 | 31 | 333 | 2,858 |
| 2010 | 31 | 333 | 2,856 |
| 2011 | 31 | 332 | 2,853 |
| 2012 | 31 | 333 | 2,852 |
| 2013 | 34 | 333 | 2,853 |
| 2014 | 34 | 333 | 2,854 |
| 2015 | 34 | 334 | 2,850 |
| 2016 | 34 | 334 | 2,851 |
| 2017 | 34 | 334 | 2,851 |
| 2018 | 34 | 333 | 2,851 |
| 2019 | 34 | 333 | 2,846 |
| 2020 | 34 | 333 | 2,842 |
| 2021 | 34 | 333 | 2,841 |
| 2022 | 34 | 333 | 2,841 |
| 2023 | 34 | 333 | 2,842 |

**注意**：1997-2012 年省级保持 31 个（不含台港澳），2013 年开始收录台湾省(710000)、香港特别行政区(810000)、澳门特别行政区(820000)，增至 34 个。

#### NBS

| 年份 | 省 | 市 | 县 | 乡 | 村 |
|------|----|----|----|----|-----|
| 2009 | 31 | 345 | 3,203 | 44,850 | 699,220 |
| 2010 | 31 | 345 | 3,199 | 44,783 | 696,066 |
| 2011 | 31 | 344 | 3,168 | 44,166 | 694,486 |
| 2012 | 31 | 345 | 3,190 | 44,614 | 694,670 |
| 2013 | 31 | 345 | 3,195 | 44,737 | 694,697 |
| 2014 | 31 | 346 | 3,198 | 40,893 | 670,479 |
| 2015 | 31 | 346 | 3,138 | 39,959 | 667,519 |ᵣ
| 2016 | 31 | 344 | 2,856 | 42,951 | 667,910 |
| 2017 | 31 | 343 | 3,009 | 43,524 | 673,804 |
| 2018 | 31 | 343 | 3,004 | 43,564 | 666,261 |
| 2019 | 31 | 342 | 2,995 | 43,105 | 658,001 |
| 2020 | 31 | 342 | 2,994 | 41,614 | 633,981 |
| 2021 | 31 | 342 | 2,990 | 41,356 | 618,134 |
| 2022 | 31 | 342 | 2,984 | 41,351 | 619,503 |
| 2023 | 31 | 342 | 2,978 | 41,352 | 620,573 |

**注意**：NBS 数据省级始终为 31 个，且**各层级（含 village）均不收录台港澳**——实测 `village` 表 71/81/82 前缀记录数为 0。（GB2260 自 2013 年起收录台湾/香港/澳门的省级代码 710000/810000/820000，那是另一套数据源，勿与 NBS 混淆。）

> ᵣ **2015 行为重建值**：原始 `NBS.2015.sqlite` 曾损坏为 0 字节，现由幸存的 `data/stats.gov.cn/2015.json` 重建（`scripts/rebuild-nbs-sqlite.ts`）。幸存 JSON 口径略小于原始 sqlite（原记录为 县3,218 / 乡41,127 / 村673,804，已随原文件丢失，此处保留备忘）。其余年份均由对应 sqlite 直接统计。

---

## 使用示例

### Node.js

```javascript
const Database = require('better-sqlite3');

// 连接 GB2260 数据库
const gb2260 = new Database('GB2260.2023.sqlite');

// 查询所有省级单位
const provinces = gb2260.prepare('SELECT * FROM province').all();

// 查询某省的所有市
const cities = gb2260.prepare(`
  SELECT c.* FROM city c
  JOIN province p ON c.provinceCode = p.code
  WHERE p.name = ?
`).all('北京市');

// 连接 NBS 数据库
const nbs = new Database('NBS.2023.sqlite');

// 查询某县的所有乡镇
const streets = nbs.prepare(`
  SELECT * FROM street WHERE areaCode LIKE ?
`).all('110101%');

// 查询某村所属的完整层级
const hierarchy = nbs.prepare(`
  SELECT
    v.name as village,
    v.code as villageCode,
    s.name as street,
    a.name as county,
    c.name as city,
    p.name as province
  FROM village v
  JOIN street s ON v.streetCode = s.code
  JOIN area a ON v.areaCode = a.code
  JOIN city c ON v.cityCode = c.code
  JOIN province p ON v.provinceCode = p.code
  WHERE v.code = ?
`).get('110101001001');

console.log(hierarchy);
```

### Python

```python
import sqlite3

# 连接数据库
conn = sqlite3.connect('GB2260.2023.sqlite')
cursor = conn.cursor()

# 查询所有省
cursor.execute('SELECT * FROM province')
provinces = cursor.fetchall()

# 查询某省的市
cursor.execute('''
  SELECT c.* FROM city c
  JOIN province p ON c.provinceCode = p.code
  WHERE p.name = ?
''', ('北京市',))
cities = cursor.fetchall()

# 关闭连接
conn.close()
```

### 命令行

```bash
# 查看数据库结构
sqlite3 GB2260.2023.sqlite ".schema"

# 查询所有省级单位
sqlite3 GB2260.2023.sqlite "SELECT * FROM province;"

# 查询某省的市
sqlite3 GB2260.2023.sqlite "SELECT * FROM city WHERE provinceCode='110000';"
```

---

## 注意事项

### 1. 台港澳处理差异

| 数据源 | 台湾省 | 香港特别行政区 | 澳门特别行政区 |
|--------|--------|---------------|---------------|
| GB2260（2013 起） | ✅ 代码 710000 | ✅ 代码 810000 | ✅ 代码 820000 |
| NBS（所有层级） | ❌ 无数据 | ❌ 无数据 | ❌ 无数据 |

NBS **所有层级（省 / 市 / 县 / 乡 / 村）均不收录台港澳**——省级与 `village` 层级实测均为 0 条。此前版本文档误称「NBS village 含台港澳」，已订正。

### 2. 代码格式差异

| 数据集 | 代码格式 | 示例 |
|--------|----------|------|
| GB2260 | 6位定长 | `110000`, `110101` |
| NBS | 6/9/12位混合 | `110000`, `110101001`, `110101001001` |

### 3. 外键约束

- 两个数据库均启用了外键约束
- 父级记录删除时，子记录的外键设为 NULL
- 部分数据可能存在孤儿记录（历史变更导致）

### 4. 数据完整性

- **NBS 2021+ 数据量下降**：统计口径调整，部分地区不再细分到村
- **历史数据差异**：某些年份可能存在缺失或格式异常
- 建议使用前先验证数据完整性

### 5. 编码说明

文件名与 SQLite 数据库内部均使用 UTF-8 编码。特殊字符（如壆壗等）可能存在兼容性问题。

### 6. 更新频率

- GB2260：每年 1-2 月发布上一年度数据
- NBS：每年 1-2 月更新，数据截止到上一年年底

### 7. 数据文件位置

```
.
├── GB2260.{year}.sqlite    # GB2260 数据 (1980-2023)
├── NBS.{year}.sqlite       # NBS 数据 (2009-2023)
├── data/
│   ├── GB2260/            # 原始 JSON 文件
│   └── stats.gov.cn/      # 原始 JSON 文件 + categoryCodes
└── scripts/               # 数据处理脚本
```

### 8. 城乡分类码（categoryCode）

**SQLite 成品不含城乡分类码**：`village` 表无 `categoryCode` 列（见上 Schema）。

城乡分类码见原始数据：
- 独立文件 `data/stats.gov.cn/categoryCodes.{year}.json` 仅 **2009–2014**（6 个年份）
- 年度嵌套 JSON（`{year}.json`）内的 `categoryCode` 内联字段覆盖 **2009–2021**（如 `"categoryCode":"111"` 主城区、`"220"` 村庄）

2022 年起 stats.gov.cn 停更，城乡分类码不再有新增来源。

---

## 数据来源

- **GB2260**: [国家统计局 - 统计数据](http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/)
- **NBS**: [国家统计局 - 统计数据库](http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/)
- **民政部**: [中华人民共和国行政区划代码](http://www.mca.gov.cn/article/sj/xzqh)

---

## 更新日志

| 日期 | 操作 |
|------|------|
| 2024-01 | 初始文档创建 |
|  | - 从民政部网站抓取 GB2260 数据 (1980-2023) |
|  | - 转换 GB2260 JSON 为 SQLite |
|  | - 转换 NBS JSON 为 SQLite |
|  | - 修复 NBS 数据中的名称/代码错误 |

---

## License

本项目数据来源于公开政府网站，仅供学习和研究使用。
