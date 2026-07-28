# @cndiv/reader

> `cndiv hydrate` 后 cache.db 的最小**只读**查询 API：屏蔽复合主键 `(code,year)` 与直辖市/省直管占位中间层两个坑。

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

## 定位

`@cndiv/cli` 的 `cndiv hydrate` 把数据注水到 `~/.cndiv/cache.db`，但只负责写入、不提供查询封装。本包补上这一层：薄封装 [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)（预编译 prepared statement + 参数绑定，无 SQL 拼接），**硬编码只读、文件必须存在**（未 hydrate 直接抛友好错误，而非静默返回空），所有查询强制 `year`。

## 安装

```bash
npm i @cndiv/reader
```

依赖 `better-sqlite3`（原生模块，需对应平台 prebuilt）。使用前先 `cndiv hydrate --year=<YYYY>` 生成 cache.db（见 [`@cndiv/cli`](../cli)）。

## 用法

```ts
import { openCache } from '@cndiv/reader';

const cn = openCache(); // 默认 ~/.cndiv/cache.db，只读打开
try {
  cn.findByCode('110101000000', 2023);                              // → Division | null（东城区）
  cn.getChildren('110000000000', 2023);                            // → [市辖区]（原始直接子级）
  cn.getChildren('110000000000', 2023, { skipPlaceholder: true }); // → [东城区, 西城区]（穿透占位层）
  cn.getDescendants('110000000000', 2023);                         // 递归全部后代（不含自身）
  cn.getParent('110101000000', 2023);                              // → 市辖区（直接父级）
  cn.getAncestors('110101001000', 2023);                           // → [北京市, 市辖区, 东城区]（祖先链）
  cn.getByLevel(3, 2023);                                          // 某层级全部（3 = 县级）
  cn.getProvinces(2023);                                           // 全部省级
  cn.findByName('东城区', 2023);                                   // 按精确名查（无索引，慎用）
  cn.listYears();                                                  // → [2020, 2023, ...] 有哪些年份快照
} finally {
  cn.close();
}
```

自定义路径：`openCache('/path/to/cache.db')`（始终只读打开）。

## API

| 方法 | 签名 | 说明 |
|---|---|---|
| `openCache` | `(dbPath?) => CnDivReader` | 打开库；默认 `~/.cndiv/cache.db`、只读；文件不存在/非有效库抛友好错误 |
| `findByCode` | `(code, year) => Division \| null` | 按码查某年快照 |
| `findByName` | `(name, year) => Division[]` | 按精确名查（name 无索引，全表扫描） |
| `getChildren` | `(parentCode, year, opts?) => Division[]` | 直接子级；`skipPlaceholder` 穿透占位层 |
| `getDescendants` | `(code, year) => Division[]` | 递归全部后代（不含自身） |
| `getParent` | `(code, year) => Division \| null` | 直接父节点；省级返回 null |
| `getAncestors` | `(code, year) => Division[]` | 祖先链（省→直接父级，level 升序，不含自身） |
| `getByLevel` | `(level, year) => Division[]` | 某层级全部 |
| `getProvinces` | `(year) => Division[]` | 全部省级（等价 `getByLevel(1, year)`） |
| `listYears` | `() => number[]` | 库内年份快照（升序） |
| `close` | `() => void` | 关闭连接 |

返回的 `Division` 类型来自 [`@cndiv/core`](../core)（出口已把 DB 的 NULL 归一为 `undefined`，兑现可选字段契约）；另导出常量 `PLACEHOLDER_NAMES`、函数 `defaultCachePath()`。

## 屏蔽的两个坑

**1. 复合主键 `(code, year)`**

每个查询都强制 `year`——同一码跨年并存，漏 year 会命中多行。这是 v2 版本化存储的必然代价，reader 替你挡掉了。

**2. 占位中间层**

NBS 在直辖市/省直管处插入 `level=2` 的占位节点（`PLACEHOLDER_NAMES`：`市辖区` / `县` / `省直辖县级行政区划` / `省直辖县级行政单位`），dmfw 扁平结构里没有。

例如：北京（`110000`）的直接子级是「市辖区」（`110100`），`getChildren(..., { skipPlaceholder: true })` 按 `level=2 + 名称` 识别并穿透一层到真实区县。

## 关于 WAL

`cndiv hydrate` 用 WAL 模式写入，但 better-sqlite3 在关闭连接时自动 checkpoint 并清除 `-wal`/`-shm` 边车——**产出的 cache.db 是自包含单文件**，可直接拷贝/分发；reader 只读打开零边车依赖，无需额外操作。

## License

MIT © [tonyc726](https://github.com/tonyc726)
