# 常见用法

先跑完 [快速上手](/guide/getting-started) 里的 `cndiv hydrate --year=2023`。第 4 节还要再执行一次 `cndiv hydrate --year=history`，两个包写进同一个 `~/.cndiv/cache.db`。

查询代码保存为 `query.mjs`，在装了 `@cndiv/reader` 的目录里执行 `node query.mjs`。下面的输出是对已发布数据包跑出来的。

```bash
npm i @cndiv/reader
```

## 1. 查一个码是哪里

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

码必须带上年份。没有这条记录时返回 `null`。12 位怎么拆见 [区划码](/guide/glossary#code-12)。

## 2. 列出北京市的区，跳过「市辖区」

北京市（`110000000000`）的直接下级只有一条，名字叫「市辖区」。它不是一个真实的区。见 [市辖区占位层](/guide/glossary#placeholder)。

```js
import { openCache } from '@cndiv/reader';

const cn = openCache();
const names = cn
  .getChildren('110000000000', 2023, { skipPlaceholder: true })
  .map((d) => d.name);
console.log(names.join('、'));
cn.close();
```

```text
东城区、西城区、朝阳区、丰台区、石景山区、海淀区、门头沟区、房山区、通州区、顺义区、昌平区、大兴区、怀柔区、平谷区、密云区、延庆区
```

不加 `{ skipPlaceholder: true }` 时，打印出来的只有「市辖区」。

## 3. 导出某一年的 CSV

```bash
cndiv export --year=2023 --output=divisions-2023.csv
```

```text
Exported 665271 records to divisions-2023.csv
```

文件大约 66 万行。看开头两行：

```bash
head -n 2 divisions-2023.csv
```

```text
code,name,level,parent_code,year,status,source_type,confidence_score
110000000000,"北京市",1,,2023,active,official_nbs,100
```

## 4. 看同一个地方在两个年份里是什么

没有单独的「撤县设区」接口。历史就是对每一年调用一次 `findByCode`。先把历史包装进同一个库：

```bash
cndiv hydrate --year=history
```

```text
Hydration complete: 131356 records imported
```

崇明在 2016 年撤县设区，区划码也换了：2015 年是 `310230000000`（崇明县），2016 年起是 `310151000000`（崇明区）。旧码在 2016 年已经查不到。

```js
import { openCache } from '@cndiv/reader';

const cn = openCache();
const years = cn.listYears();
console.log(years[0], years.at(-1), years.length);
console.log(2015, cn.findByCode('310230000000', 2015)?.name ?? null);
console.log(2016, cn.findByCode('310230000000', 2016));
console.log(2016, cn.findByCode('310151000000', 2016)?.name ?? null);
cn.close();
```

```text
1980 2023 43
2015 崇明县
2016 null
2016 崇明区
```

`43` 是库里的年份个数：1980–2021 再加上 2023。没有 2022，而且 2021 年只有 21 条。
