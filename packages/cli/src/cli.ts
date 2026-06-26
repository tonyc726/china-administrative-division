#!/usr/bin/env node
/**
 * @cndiv/cli
 *
 * Command-line interface for Chinese administrative division data management.
 *
 * Usage:
 *   cndiv hydrate --year=2023    Download and import data from NPM
 *   cndiv migrate --input=<dir>  Migrate legacy JSON data to SQLite
 *   cndiv export --year=2023     Export data to CSV
 */

import { hydrate, exportFromCache } from './hydrate.js';
import { applyPatch } from './apply-patch.js';

// CLI argument parsing
const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  switch (command) {
    case 'hydrate': {
      // Parse hydrate arguments
      const year = args.find((a) => a.startsWith('--year='))?.split('=')[1];
      const cacheDir = args.find((a) => a.startsWith('--cache='))?.split('=')[1];
      const tarball = args.find((a) => a.startsWith('--tarball='))?.split('=')[1];
      const verbose = args.includes('--verbose');

      if (!year) {
        console.error('Error: --year is required');
        console.error('Usage: cndiv hydrate --year=<YYYY> [--tarball=<file.tgz>]');
        process.exit(1);
      }

      await hydrate({ year, cacheDir, verbose, tarball });
      break;
    }

    case 'migrate': {
      // 统一迁移：复用 ./migrate.ts（复用 core 码工具 + data-protocol DATABASE_SCHEMA）
      const input = args.find((a) => a.startsWith('--input='))?.split('=')[1];
      const output =
        args.find((a) => a.startsWith('--output='))?.split('=')[1] ||
        './dist/source-history.db';

      if (!input) {
        console.error('Error: --input is required');
        console.error('Usage: cndiv migrate --input=<directory> [--output=<db>]');
        process.exit(1);
      }

      // 动态导入：仅在用到 migrate 时才加载 better-sqlite3 原生模块
      const { migrate } = await import('./migrate.js');
      const result = await migrate({ input, output });
      console.log(
        `\nMigration complete: ${result.records} 条 / ${result.years.length} 年 (${result.skipped} 跳过) → ${output}`,
      );
      break;
    }

    case 'export': {
      const year = args.find((a) => a.startsWith('--year='))?.split('=')[1];
      const output = args.find((a) => a.startsWith('--output='))?.split('=')[1];
      const cacheDir = args.find((a) => a.startsWith('--cache='))?.split('=')[1];

      if (!year) {
        console.error('Error: --year is required');
        console.error('Usage: cndiv export --year=<YYYY> [--output=<file>]');
        process.exit(1);
      }

      await exportFromCache(parseInt(year, 10), cacheDir, output);
      break;
    }

    case 'apply-patch':
    case 'patch': {
      const patchPath = args.find((a) => a.startsWith('--patch='))?.split('=')[1];
      const cacheDir = args.find((a) => a.startsWith('--cache='))?.split('=')[1];
      const dryRun = args.includes('--dry-run');

      if (!patchPath) {
        console.error('Error: --patch is required');
        console.error('Usage: cndiv apply-patch --patch=<file.json> [--dry-run]');
        process.exit(1);
      }

      await applyPatch({ patch: patchPath, cacheDir, dryRun });
      break;
    }

    case 'version':
    case '--version':
    case '-v': {
      console.log('@cndiv/cli v1.0.0');
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`
@cndiv/cli - Chinese Administrative Division Data CLI

Usage:
  cndiv <command> [options]

注：参数使用 --key=value 连写形式。

Commands:
  hydrate --year=<YYYY>       Download and import data from NPM (或 --tarball=<file.tgz> 离线注水)
  migrate --input=<dir>       Migrate legacy GB2260 JSON data to SQLite (复合主键 code,year)
  export --year=<YYYY>        Export data to CSV format
  apply-patch --patch=<file>  Apply a community patch to the database
  version                     Show version information
  help                        Show this help message

Examples:
  cndiv hydrate --year=2023
  cndiv hydrate --year=2023 --tarball=./cndiv-source-2023-2023.0.0.tgz
  cndiv hydrate --year=2023 --cache=~/.cndiv
  cndiv migrate --input=./legacy/data/GB2260 --output=./dist/source-history.db
  cndiv export --year=2023 --output=./2023.csv
  cndiv apply-patch --patch=patches/2025/310115-pudong-update.json

For more information, visit:
  https://github.com/tonyc726/china-administrative-division
`);
      break;
    }
  }
}

main().catch(console.error);
