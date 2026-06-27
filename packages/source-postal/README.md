# @cndiv/source-postal

> 中国邮政编码(邮编) + 长途电话区号(区号) 数据包，源自 ip138，县级粒度，约 2855 条

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

## 这不是区划数据

本包是**地理参考数据**（邮编/区号），与行政区划(divisions)**完全异构**：

- CSV 列为 `province,name,zip_code,area_code`，**没有 12 位 code、没有 level**，无法直接 join 到 divisions，只能按 `name` 弱匹配。
- 邮编/区号近静态（不随区划逐年增改），故由 `@cndiv/data-protocol` 的 **`PostalRecordSchema`** 单列契约承载，与 divisions 解耦。
- **它不是 `cndiv hydrate` 的注水目标**——`hydrate` 只处理区划数据包，对本包无意义。消费方式是**直读 CSV** 或用 **`validatePostalRecord`** 逐条校验。

## 数据结构

数据文件：`data/postal.csv`（+ `data/manifest.json`，含 `rows` / `sha512` 完整性信息）。

| 列 | 含义 | 示例 | 约束（PostalRecordSchema） |
| --- | --- | --- | --- |
| `province` | 一级行政区名称 | `上海市` | `string`，≥1 |
| `name` | 区县级名称 | `嘉定区` | `string`，≥1 |
| `zip_code` | 6 位邮政编码 | `201800` | `/^\d{6}$/` |
| `area_code` | 长途区号，0 开头 3–4 位 | `021` | `/^0\d{2,3}$/` |

> **解析陷阱**：`zip_code` / `area_code` 在协议中均为**字符串**。CSV 里 `area_code` 写作裸值 `021`，按数字解析会丢前导 0 导致校验失败——读取时务必以字符串处理。

## 用法

### 直读 CSV

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 无 exports 字段，可直接定位子路径文件
const csvPath = createRequire(import.meta.url).resolve('@cndiv/source-postal/data/postal.csv');
const csv = readFileSync(csvPath, 'utf8');
// 用任意 CSV parser 解析；保持所有列为 string
```

### 校验单条记录

```ts
import { validatePostalRecord } from '@cndiv/data-protocol';

const result = validatePostalRecord({
  province: '上海市',
  name: '嘉定区',
  zip_code: '201800',
  area_code: '021',
});

if (result.success) {
  result.data; // PostalRecord
} else {
  result.error; // ZodError
}
```

## 重抓（数据更新）

ip138 页面结构易变，解析以 `@cndiv/crawler` 现网实现为准。需要刷新时由 crawler 重抓，产出覆盖本包 `data/`：

```bash
# bin（@cndiv/crawler 提供）
cndiv-postal --out=packages/source-postal/data --delay=150

# 或 Monorepo 内
pnpm --filter @cndiv/crawler crawl:postal
```

`--out=` 输出目录（默认 `packages/source-postal/data`）；`--delay=` 各省抓取间隔毫秒（默认 `150`，顺序限速）。抓取后逐条经 `validatePostalRecord` 校验，并生成确定性 `manifest.json`（SHA-512，无时间戳）。

## License

MIT © [tonyc726](https://github.com/tonyc726)
