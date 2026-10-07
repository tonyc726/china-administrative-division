---
title: "@cndiv/cli"
---

# @cndiv/cli

命令行。装数据、导出 CSV、把一份 [Patch](/guide/glossary#patch) 应用到本地库。查询用 [`@cndiv/reader`](/reference/reader)，不在这个命令里。

[npm](https://www.npmjs.com/package/@cndiv/cli) · 包内完整说明：[`packages/cli/README.md`](https://github.com/tonyc726/china-administrative-division/blob/master/packages/cli/README.md)

## 安装

```bash
npm i -g @cndiv/cli
```

不装到全局也可以：`npx @cndiv/cli hydrate --year=2023`。

::: warning 参数写法
全部写成 `--key=value`。`--year 2023` 无效。
:::

默认目录是 `~/.cndiv`，数据库是 `~/.cndiv/cache.db`。换目录用 `--cache=<目录>`。

## 命令

| 命令 | 必填参数 | 做什么 |
|---|---|---|
| `hydrate` | `--year=2023` 或 `--year=history` | 从 npm 下载数据包并写入 `cache.db`。离线包用 `--tarball=<file.tgz>` |
| `export` | `--year=<YYYY>` | 把某一年导出成 CSV。`--output=<file>` 省略时打到标准输出 |
| `apply-patch`（别名 `patch`） | `--patch=<file>` | 把一份 Patch 应用到本地库。`--dry-run` 只预览 |

`migrate`、`backfill`、`merge-patches` 是维护数据包用的，说明在包 README 里。

## 例子

```bash
cndiv hydrate --year=2023
cndiv export --year=2023 --output=divisions-2023.csv
```

对已发布的 `@cndiv/source-2023`，这两行的结果是：

```text
Hydration complete: 665271 records imported
Exported 665271 records to divisions-2023.csv
```

CSV 开头：

```text
code,name,level,parent_code,year,status,source_type,confidence_score
110000000000,"北京市",1,,2023,active,official_nbs,100
```

历史年份和「同一个码在两个年份」见 [常见用法](/guide/recipes)。
