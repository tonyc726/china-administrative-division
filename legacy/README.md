# 中华人民共和国行政区划代码（v1 · 已退役存档 🪦）

> 🪦 **功成身退（Mission complete）**：v1 旧版爬虫的历史使命已由 v2 接管，本目录退役为只读墓碑。
> 自 v2 起 `legacy/` 已**移出 pnpm workspace**，不参与构建/门禁；数据源 `stats.gov.cn` 亦已于 2024 起停更（转「国家地名信息库」dmfw.mca.gov.cn），旧爬虫 URL 解析失效。
> 当前架构与用法见仓库根 [`README.md`](../README.md)。

## 价值去向（删 legacy 不丢任何东西）

| v1 资产 | 去向 |
|---|---|
| **GB2260 1980–2021 历史** | 已固化为 [`@cndiv/source-history`](../packages/source-history)（`migrate` 从 `legacy/data/GB2260/*.json.gz` 产出，131356 条 / 42 年 / 0 丢弃；逐行 `year` 版本化，`cndiv hydrate --year=history` 注水） |
| **ip138 邮编/区号爬虫** | 已按现网 UTF-8 重写为 [`@cndiv/crawler`](../packages/crawler) 的 `ip138.ts`（旧 GB2312 版失效，故未保留） |
| **stats.gov.cn 五级数据** | 产物 `NBS.<year>.sqlite` 见冷母本与 GitHub Release [`data-snapshot-2023`](https://github.com/tonyc726/china-administrative-division/releases/tag/data-snapshot-2023) |
| **死爬虫脚本** | 已删除（数据源失效或已被 v2 取代，无运行价值） |

## 仅保留的"生产链备查"代码

`scripts/utils/` 下仅留 JSON→SQLite 生产链供将来 TS 化参考（依赖 v1 npm 包，**在 v2 内不可直接运行**，纯参考）：
- `exportSqlite.js`（JSON→SQLite 主流程）· `sqlite.js`（连接）· `sqlite-gb2260.js`（GB2260 专用）
- v1 完整依赖清单（sequelize 等）见 git history：`git show aa6c282:legacy/package.json`

## 本地数据（不在 git）

`legacy/data/`（GB2260 `*.json.gz` 等）与 `pageCacheDB/`（stats 原始页面缓存 447M）均被 `.gitignore` 排除，仅在本地工作区。
**建议**：`data/GB2260` 是 `source-history` 的重建源，请纳入冷母本备份（`scripts/backup-cold-master.sh`）；`pageCacheDB` 产物已固化，可删。

## 特殊说明

由于[国家统计局 - 行政区划代码](http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/)的数据文件太大，所以采集到的`2009`-`2020`的数据全部存在`pageCacheDB/stats.gov.cn`中（v1 爬虫已随本目录退役，如需数据见 GitHub Release [`data-snapshot-2023`](https://github.com/tonyc726/china-administrative-division/releases/tag/data-snapshot-2023)）。

## 现状简介

截至 2022 年，中华人民共和国各级行政区划统计数量如下：

- [省级行政区**34**个](https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%9B%BD%E4%B8%80%E7%BA%A7%E8%A1%8C%E6%94%BF%E5%8C%BA)，其中包括：[**4**个直辖市](https://zh.wikipedia.org/wiki/%E7%9B%B4%E8%BE%96%E5%B8%82)，[**23**个省](<https://zh.wikipedia.org/wiki/%E7%9C%81_(%E8%A1%8C%E6%94%BF%E5%8D%80%E5%8A%83)>)，[**5**个自治区](https://zh.wikipedia.org/wiki/%E8%87%AA%E6%B2%BB%E5%8C%BA)，[**2**个特别行政区](https://zh.wikipedia.org/wiki/%E7%89%B9%E5%88%AB%E8%A1%8C%E6%94%BF%E5%8C%BA)
- [地级行政区**333**个](https://zh.wikipedia.org/wiki/%E5%9C%B0%E7%BA%A7%E8%A1%8C%E6%94%BF%E5%8C%BA)
- [县级行政区**2846**个](https://zh.wikipedia.org/wiki/%E5%8E%BF%E7%BA%A7%E8%A1%8C%E6%94%BF%E5%8C%BA)

各级层次架构，可以用以下图来概括：
![中华人民共和国行政区划架构图](./docs/images/System_of_China_administrative_division.png)

地级行政区划（不含不在管辖范围内的台湾）图例依次表示：地级市、地区、自治州、副地级行政区、盟、直辖市/特别行政区、副省级行政区：
![地级行政区划](<./docs/images/China_Prefectural-level_divisions_(PRC_claim)_min.png>)

## 编码规则

> 具体可以参考[《民政统计代码编制规则》](http://www.mca.gov.cn/article/sj/tjbz/a/201507/20150700854848.shtml)

《中华人民共和国行政区划代码》国家标准中定义县及县以上使用 6 位数字标识，代码从左至右的含义是：

- 第一、二位表示省级行政单位（省、自治区、直辖市、特别行政区），其中第一位代表[大区](https://zh.wikipedia.org/wiki/Category:%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%88%92%E4%BB%A3%E7%A0%81)；
- 第三、四位表示地级行政单位（地级市、地区、自治州、盟及省级单位直属县级单位的汇总码）；
- 第五、六位表示县级行政单位（县、自治县、市辖区、县级市、旗、自治旗、林区、特区）；

另外，《民政统计代码编制规则》中定义了 12 位的编码，分为 3 段，用于统计到最基层的居委会，具体规则如下：

```
□□□□□□ ----- □□□ ----- □□□
  ↑           ↑         ↑
第一段       第二段     第三段
```

- 第一段为 **6 位数字**，表示县及县以上的行政区划，使用《中华人民共和国行政区划代码》国家标准；
- 第二段为 **3 位数字**，按照国家标准《县以下行政区划代码编制规则》编制，其规则如下：
  - 第二段的第一位数字为类别标识，以“0”表示街道，“1”表示镇，“2 和 3”表示乡，“4 和 5”表示政企合一的单位；
  - 第二段的第二位、第三位数字为该代码段中各行政区划的顺序号；
- 第三段 **3 位数字**，标识居民委员会和村民委员会的代码

## 数据说明

> 由于`GB/T 2260`未包含**香港**、**澳门**、**台湾**的行政区划数据，所以分别借鉴`ISO3166-2:HK`、`ISO3166-2:MO`、`ISO3166-2:TW`进行数据补全，但是请注意：**这些数据中的行政区划代码并非官方标准**，请谨慎使用。

数据以数据源作为分类，按照发布的年份作为单独文件，分别以一维数组的方式存储在`data`的二级目录下。

```
data
├── GB2260
│   ├── 1980.json
│   ├── 1981.json
│   ├── 1982.json
│   ├── 1983.json
│   ├── 1984.json
│   ├── 1985.json
│   ├── 1986.json
│   ├── 1987.json
│   ├── 1988.json
│   ├── 1989.json
│   ├── 1990.json
│   ├── 1991.json
│   ├── 1992.json
│   ├── 1993.json
│   ├── 1994.json
│   ├── 1995.json
│   ├── 1996.json
│   ├── 1997.json
│   ├── 1998.json
│   ├── 1999.json
│   ├── 2000.json
│   ├── 2001.json
│   ├── 2002.json
│   ├── 2003.json
│   ├── 2004.json
│   ├── 2005.json
│   ├── 2006.json
│   ├── 2007.json
│   ├── 2008.json
│   ├── 2009.json
│   ├── 2010.json
│   ├── 2011.json
│   ├── 2012.json
│   ├── 2013.json
│   ├── 2014.json
│   ├── 2015.json
│   ├── 2016.json
│   ├── 2017.json
│   ├── 2018.json
│   ├── 2019.json
│   ├── 2020.json
│   └── 2021.json
├── ISO3166-2
│   ├── HK.json
│   ├── MO.json
│   └── TW.json
└── stats.gov.cn
    ├── 2009.json
    ├── 2010.json
    ├── 2011.json
    ├── 2012.json
    ├── 2013.json
    ├── 2014.json
    ├── 2015.json
    ├── 2016.json
    ├── 2017.json
    ├── 2018.json
    ├── 2019.json
    ├── 2020.json
    └── 2021.json
```

## 参考链接

- [国家统计局 - 行政区划代码](http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/)
- [民政部 - 中华人民共和国行政区划代码](http://www.mca.gov.cn/article/sj/xzqh)
- [维基百科 - 中华人民共和国行政区划](https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%88%92)
- [维基百科 - 中华人民共和国行政区划代码](https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%88%92%E4%BB%A3%E7%A0%81)
- [统计上使用的县以下行政区划代码编制规则](http://www.mca.gov.cn/article/sj/xzqh/1980/201507/20150715854849.shtml)
- [民政统计代码编制规则](http://www.mca.gov.cn/article/sj/xzqh/1980/201507/20150715854848.shtml)
- [网友资源 - ISO3166-2](http://www.zxinc.org/gb2260-latest.htm)

## License

Copyright © 2017-present. This source code is licensed under the MIT license found in the
[LICENSE](./LICENSE) file.

---

Made by Tony ([blog](https://itony.net))
