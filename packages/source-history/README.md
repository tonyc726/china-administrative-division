# @cndiv/source-history

> GB/T 2260 中国行政区划历史数据包：1980–2021 逐年快照，按 `(code, year)` 复合主键做年份版本化

[china-administrative-division](https://github.com/tonyc726/china-administrative-division) Monorepo 的组成部分。完整架构见**主仓库 README**。

这是一个**纯数据包**（仅发布 `data/`，无 JS 运行时导出）。消费方式：用 `cndiv hydrate` 注水进本地 SQLite，或直接读 `data/divisions.csv`。

## 数据

| 项 | 值 |
| --- | --- |
| 来源 | GB/T 2260（由 `legacy/data/GB2260/*.json.gz` 经 `cndiv migrate` 固化） |
| 文件 | `data/divisions.csv` + `data/manifest.json` |
| 行数 | 131356 行（≈42 个年份） |
| 年份 | 1980 – 2021 |
| 层级 | `level` ∈ {1, 2, 3} = 省 / 市 / 县 |
| 校验 | `manifest.json` 内置 `divisions.csv` 的 SHA-512（hydrate 时 fail-closed 校验） |

### CSV 列结构（8 列，与 `@cndiv/source-2023` 完全一致）

```
code,name,level,parent_code,year,status,source_type,confidence_score
110000000000,"北京市",1,,1980,active,official_nbs,100
```

与单年份数据包的唯一区别：本包**每一行都带 `year`**，同一 `code` 跨多个年份并存。注水后落入 SQLite 的 `divisions` 表，主键即 `PRIMARY KEY (code, year)`，故"按年取快照"是 `WHERE year = ?` 的天然查询。

## 必读：2021 是部分快照，不是全量区划

- **1980–2020**：每年都是**完整区划**（每年约 3100+ 行）。
- **2021**：仅为源头的**部分变更快照**——只有约 **21 条变更流水**（`name` 形如 `撤销`、`撤销 设立 临平区`），**并非当年全量区划**。

```
330110000000,"撤销 设立 临平区",3,330100000000,2021,active,official_nbs,100
350427000000,"撤销 设立 沙县区",3,350400000000,2021,active,official_nbs,100
```

所以：把 `year=2021` 当作"2021 完整区划集"去用是错的；它只表达"相对 2020 发生了哪些撤并设立"。需要稳定的全量当代基线请用 `@cndiv/source-2023`（NBS，levels=5）。

## 用法

### 注水（推荐）

```bash
# 从 NPM 拉取 @cndiv/source-history 并导入 ~/.cndiv/cache.db
cndiv hydrate --year=history

# 离线注水：直接喂本地 tarball（如 GitHub Release 附件），跳过 NPM
cndiv hydrate --year=history --tarball=./cndiv-source-history-0.1.0.tgz

# 自定义缓存目录
cndiv hydrate --year=history --cache=~/.cndiv
```

`--year=history` 会被拼成包名 `@cndiv/source-history`。导入时 **hydrate 尊重 CSV 逐行 `year`**（按每行自身年份入库，而非把整包压成单一年份），因此一次注水即得 1980–2021 全部年份版本。

### 按年取快照（SQLite 查询示意）

注水后数据在 `~/.cndiv/cache.db` 的 `divisions` 表：

```sql
-- 取某一完整年份的全量区划（例：2020）
SELECT code, name, level, parent_code
FROM   divisions
WHERE  year = ?            -- 绑定 2020
ORDER  BY code;

-- 注意：year = 2021 只会返回那 21 条变更流水，而非全量
```

或用 CLI 直接把某年份导出成 CSV：

```bash
cndiv export --year=2020 --output=./2020.csv
```

## License

MIT © [tonyc726](https://github.com/tonyc726)
