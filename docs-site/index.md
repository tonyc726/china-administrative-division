---
layout: home

hero:
  name: 全国五级行政区划代码
  text: 1980–2023 历年版本，一条命令装到本地 SQLite
  tagline: 查一个码、列出下级、导出某年的 CSV。
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: 常见用法
      link: /guide/recipes
    - theme: alt
      text: 在 GitHub 查看
      link: https://github.com/tonyc726/china-administrative-division

features:
  - title: 数据全
    details: 2023 年从省到村五级都在，一共 665,271 条，其中村和社区 620,572 条。
    link: /data/snapshots
    linkText: 下载快照
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  - title: 有历史
    details: 1980–2021 年的省、市、县可以按年份查。同一个码在不同年份可以是不同的地方。
    link: /data/history
    linkText: 看历年变化
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  - title: 离线可查
    details: 数据装进你自己的 SQLite 文件。装好之后断网也能查，也能直接写 SQL。
    link: /guide/getting-started
    linkText: 30 秒装好
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
---

## 30 秒上手

参数写成 `--year=2023`，中间不要空格。

```bash
npm i -g @cndiv/cli
npm i @cndiv/reader
cndiv hydrate --year=2023
```

成功时日志以这一行结束（数字来自已发布的 `@cndiv/source-2023`）：

```text
Hydration complete: 665271 records imported
```

然后查东城区：

```js
import { openCache } from '@cndiv/reader';

const cn = openCache();
console.log(cn.findByCode('110101000000', 2023));
cn.close();
```

```text
{
  code: '110101000000',
  name: '东城区',
  level: 3,
  parent_code: '110100000000',
  year: 2023,
  status: 'active',
  source_type: 'official_nbs',
  confidence_score: 100,
  urban_rural_code: undefined
}
```

更多可以复制的例子见 [常见用法](/guide/recipes)。名词见 [术语表](/guide/glossary)。

## 2023 年有多少条

<LevelScaleChart />
