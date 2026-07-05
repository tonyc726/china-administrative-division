/**
 * @cndiv/cli — 程序化库 API
 *
 * 仅导出可编程接口（hydrate / export / apply-patch / migrate）。
 * CLI 运行器 cli.ts 是 bin 入口（package.json#bin），不在库表面，避免 import 即执行的副作用。
 */

export * from './hydrate.js'; // hydrate, exportFromCache
export * from './apply-patch.js'; // applyPatch
export * from './migrate.js'; // migrate, MigrateOptions, MigrateResult
