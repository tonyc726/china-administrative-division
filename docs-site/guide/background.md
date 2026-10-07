# 项目背景

想先查数据，从 [快速上手](/guide/getting-started) 开始。这一页解释数据为什么要按年份留着。

## 官方全量不再公开发布

原来的来源是国家统计局网站上的「统计用区划代码和城乡划分代码」。**2024 年起停止公开发布**，**2026 年起转到 [国家地名信息库](https://dmfw.mca.gov.cn)**（[dmfw](/guide/glossary#dmfw)）。五级全量没有一个还在更新的官方下载地址。

旧做法是把那个网站镜像下来。源一停，镜像也就停了。

## 现在的做法

留一份 **2023 年的全量**，之后的变更写成 [Patch](/guide/glossary#patch)，需要时再和其他来源对一下。数据和程序分开：

```text
维护者整理数据 → 打成 npm 包 @cndiv/source-年份
用户执行 cndiv hydrate → 本机 ~/.cndiv/cache.db
变更写在 patches/*.json → cndiv apply-patch
```

使用者只从 npm 把数据包 [注水](/guide/glossary#hydrate) 到本地 SQLite，不访问统计局或地名信息库。大文件不进 git，走 npm 和 GitHub Release。

每条记录带来源，大致四档：`official_nbs`（统计局）＞ `mca_decree`（民政部公报）＞ `community`（社区提交）＞ `shadow_map`（商业地图推断）。

## 三条来源

| 层 | 来源 | 做什么 |
|---|---|---|
| 基准 | 2023 年五级全量 | 不再改写的底账，村级 620,572 条 |
| 之后的变更 | 国家地名信息库 | 维护者采集差异，写成 Patch |
| 对照 | [modood/Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China)（WTFPL）等 | 交叉核对、补历史 |

## 为什么要按年份存

县级单位的总数四十年几乎不动。真正常发生的是撤县设区、县改市：总数不变，每个码的含义变了。

<HistoryTrendChart />

所以同一条码可以在不同年份各存一行（主键是码 + 年份）。这样才能回答「2015 年的这个码是什么」。例子见 [常见用法 · 两个年份](/guide/recipes)。

[GB2260 与 NBS](/guide/glossary#gb2260-nbs) 的差别、以及数据包的校验和，见 [历年快照与下载](/data/snapshots)。
