---
"@cndiv/reader": minor
---

新增 `@cndiv/reader` 包：`cndiv hydrate` 后 cache.db 的最小**只读**查询 API。

- 薄封装 better-sqlite3（prepared statement + 参数绑定，无 SQL 拼接），只读打开、`fileMustExist`（未 hydrate 直接抛错而非静默返回空）。
- 屏蔽两个高频坑：所有查询强制 `year`（复合主键 `(code,year)`）；`getChildren` 的 `skipPlaceholder` 穿透直辖市「市辖区」占位中间层。
- API：`openCache` / `findByCode` / `findByName` / `getChildren` / `getDescendants` / `getByLevel` / `getProvinces` / `listYears` / `close`。
- 依赖最小：仅 `better-sqlite3` + `@cndiv/core`（类型），让 core 保持零依赖纯净。
