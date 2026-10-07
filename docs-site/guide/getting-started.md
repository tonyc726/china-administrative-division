# 快速上手

把数据装进本机的一个 SQLite 文件，然后用命令或代码查询。这一步叫 [注水](/guide/glossary#hydrate)。

## 装 2023 年五级数据

```bash
npm i -g @cndiv/cli
cndiv hydrate --year=2023
```

::: warning 参数写法
参数写成 `--year=2023`。`--year 2023` 这种空格分隔无效。
:::

文件在 `~/.cndiv/cache.db`。可以用 `sqlite3`、[`@cndiv/reader`](/reference/reader)，或任意 SQLite 客户端打开。

成功时日志以这一行结束：

```text
Hydration complete: 665271 records imported
```

导出成 CSV：

```bash
cndiv export --year=2023 --output=divisions-2023.csv
```

```text
Exported 665271 records to divisions-2023.csv
```

| `--year` | 装进库里的内容 | 数据包 |
|---|---|---|
| `2023` | 五级全量（省 / 市 / 县 / 乡 / 村），665,271 条 | `@cndiv/source-2023` |
| `history` | 1980–2021 年的省 / 市 / 县，合计 131,356 条。和 2023 写进同一个 `cache.db` | `@cndiv/source-history` |

`history` 里 2021 年只有 21 条，中间缺 2022 年。要查 2015 和 2016 这种对照，两个命令都跑一遍即可。名词对照见 [GB2260 与 NBS](/guide/glossary#gb2260-nbs)。

命令一览见 [`@cndiv/cli`](/reference/cli)。

## 也可以直接下载快照

不想装命令行时，从 GitHub Release [`data-snapshot-2023`](https://github.com/tonyc726/china-administrative-division/releases/tag/data-snapshot-2023) 下载历年 SQLite 和原始 JSON。

```bash
shasum -a 256 -c SHA256SUMS.txt
tar -xzf nbs-sqlite-2009-2023.tar.gz
sqlite3 NBS.2023.sqlite "SELECT count(*) FROM village;"   # → 620573
```

`620573` 是原始表里的村级行数。`cndiv hydrate` 会丢掉一行「自己指向自己」的占位记录，所以分发数据里的村级是 **620,572**。差 1 是预期的。

文件清单见 [历年快照与下载](/data/snapshots)。

## 下一步

- 复制几段就能跑的例子 → [常见用法](/guide/recipes)
- 选哪个包 → [在代码中使用](/guide/usage)
- 名词 → [术语表](/guide/glossary)

改数据、发版本、跑采集的人从 [贡献者](/contributors/) 进入。
