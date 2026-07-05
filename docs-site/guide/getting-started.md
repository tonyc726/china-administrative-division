# 快速上手

获取数据有两条路径：**CLI 注水**（推荐，用户侧零爬虫）与**直接下载历史快照**。

## 方式一：CLI 注水（推荐）

```bash
npm i -g @cndiv/cli      # 或 pnpm add -g @cndiv/cli
```

```bash
cndiv hydrate --year=2023     # 下载 @cndiv/source-2023 → ~/.cndiv/cache.db
cndiv apply-patch --patch=patches/2025/310115-pudong-update.json
cndiv export --year=2023 --output=divisions-2023.csv
```

::: warning 参数写法
参数一律使用 `--key=value` 连写形式（如 `--year=2023`），不支持空格分隔。
:::

`cndiv hydrate` 把数据落到 `~/.cndiv/cache.db`（**标准 SQLite**），可直接用 `sqlite3` / 任意 SQLite 客户端查询，也可用 [`@cndiv/reader`](/reference/reader) 在 JS 里查询。

支持的年份维度：

| `--year` | 内容 | 数据包 |
|---|---|---|
| `2023` | NBS 五级全量（省/市/县/乡/村） | `@cndiv/source-2023` |
| `history` | GB2260 历史（1980–2021，逐年版本化，131,356 条 / 42 年） | `@cndiv/source-history` |

完整 CLI 子命令（`hydrate` / `apply-patch` / `migrate` / `export` / `backfill`）见 [`@cndiv/cli` 参考](/reference/cli)。

## 方式二：直接下载历史快照

完整历年数据（GB2260 1980–2023、NBS 2009–2023 五级 SQLite + 原始 JSON）见 GitHub Release [`data-snapshot-2023`](https://github.com/tonyc726/china-administrative-division/releases/tag/data-snapshot-2023)。

```bash
# 校验并解压
shasum -a 256 -c SHA256SUMS.txt
tar -xzf nbs-sqlite-2009-2023.tar.gz
sqlite3 NBS.2023.sqlite "SELECT count(*) FROM village;"   # → 620573（原始 NBS 表）
```

> `620573` 是**原始 NBS 直采成品**的村级计数。而 `cndiv hydrate` 注水的**分发基线**会丢弃 NBS 的自指占位行（直筒子市、金门县等 `parent === code` 的补位记录），村级为 **620,572**——首页与图表所示即此。两者相差 1 属预期,非数据错误。

逐文件 SHA-256 完整性清单与数据字典见 [历年快照与下载](/data/snapshots)。

## 下一步

- 在代码里用码工具 / 查询数据 → [在代码中使用](/guide/usage)
- 提交行政区划变更 → [贡献 Patch](/guide/contributing-patch)
