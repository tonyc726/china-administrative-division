# @cndiv/source-history

## 0.2.0

### Minor Changes

- e929129: 新增 GB2260 行政区划历史数据包（1980–2021，131356 条 / 42 年，按 `(code, year)` 逐行版本化）。

  由 `legacy/data/GB2260/*.json.gz` 经 `cndiv migrate --csv` 固化为确定性 `divisions.csv`（按 code,year 稳定排序）+ SHA-512 `manifest.json`；`cndiv hydrate --year=history` 在线/离线注水，fail-closed 完整性校验。注意 2021 为源头部分快照（仅 21 条变更流水），1980–2020 为完整年份。
