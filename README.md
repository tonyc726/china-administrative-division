# 中华人民共和国行政区划代码

[![Build Status](https://travis-ci.org/tonyc726/china-administrative-division.svg?style=flat-square&branch=master)](https://travis-ci.org/tonyc726/china-administrative-division)
[![tested with jest](https://img.shields.io/badge/tested_with-jest-99424f.svg)](https://github.com/facebook/jest)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg?style=flat-square)](https://github.com/tonyc726/china-administrative-division)

> 本项目提供 2 个爬虫用于爬取**国家统计局**及**民政部**公布的数据，相对而言**民政部**公布的数据更加符合`GB/T 2260`的标准。

## 特殊说明

由于[国家统计局 - 行政区划代码](http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/)的数据文件太大，所以采集到的`2009`-`2018`的数据全部存在`pageCacheDB/stats.gov.cn`中，如需文件请运行`npm run stats-gov:crawler`自行导出或者提交 issue。

## 现状简介

截至 2020 年 3 月底，中华人民共和国各级行政区划统计数量如下：

- [省级行政区**34**个](https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%9B%BD%E4%B8%80%E7%BA%A7%E8%A1%8C%E6%94%BF%E5%8C%BA)，其中包括：[**4**个直辖市](https://zh.wikipedia.org/wiki/%E7%9B%B4%E8%BE%96%E5%B8%82)，[**23**个省](<https://zh.wikipedia.org/wiki/%E7%9C%81_(%E8%A1%8C%E6%94%BF%E5%8D%80%E5%8A%83)>)，[**5**个自治区](https://zh.wikipedia.org/wiki/%E8%87%AA%E6%B2%BB%E5%8C%BA)，[**2**个特别行政区](https://zh.wikipedia.org/wiki/%E7%89%B9%E5%88%AB%E8%A1%8C%E6%94%BF%E5%8C%BA)
- [地级行政区**333**个](https://zh.wikipedia.org/wiki/%E5%9C%B0%E7%BA%A7%E8%A1%8C%E6%94%BF%E5%8C%BA)
- [县级行政区**2855**个](https://zh.wikipedia.org/wiki/%E5%8E%BF%E7%BA%A7%E8%A1%8C%E6%94%BF%E5%8C%BA)

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

## 使用说明

### 系统依赖

- Linux/MAC
- Node.js > `v8.*`
- npm > `v5.*` 或者 yarn

### 爬取数据

```bash
npm install

npm run crawler
```

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
│   └── 2020.json
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
    └── 2019.json
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
