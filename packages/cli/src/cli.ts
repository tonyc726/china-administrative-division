#!/usr/bin/env node
/**
 * @cn-division/cli
 *
 * Command-line interface for Chinese administrative division data management.
 *
 * Usage:
 *   cn-div hydrate --year 2023    Download and import data from NPM
 *   cn-div migrate --input <dir>  Migrate legacy JSON data to SQLite
 *   cn-div export --year 2023     Export data to CSV
 */

import { hydrate, exportFromCache } from './hydrate.js';
import { applyPatch } from './apply-patch.js';
import path from 'path';

// CLI argument parsing
const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  switch (command) {
    case 'hydrate': {
      // Parse hydrate arguments
      const year = args.find((a) => a.startsWith('--year='))?.split('=')[1];
      const cacheDir = args.find((a) => a.startsWith('--cache='))?.split('=')[1];
      const verbose = args.includes('--verbose');

      if (!year) {
        console.error('Error: --year is required');
        console.error('Usage: cn-div hydrate --year <YYYY>');
        process.exit(1);
      }

      await hydrate({ year, cacheDir, verbose });
      break;
    }

    case 'migrate': {
      // Parse migrate arguments
      const inputDir = args.find((a) => a.startsWith('--input='))?.split('=')[1];
      const outputPath = args.find((a) => a.startsWith('--output='))?.split('=')[1];

      if (!inputDir) {
        console.error('Error: --input is required');
        console.error('Usage: cn-div migrate --input <directory>');
        process.exit(1);
      }

      // Dynamic import to avoid circular dependencies
      const { default: Database } = await import('better-sqlite3');
      const { createGunzip } = await import('zlib');
      const { createReadStream } = await import('fs');
      const { glob } = await import('glob');

      const output = outputPath || './dist/source-history.db';
      const db = new Database(output);
      db.pragma('journal_mode = WAL');

      // Create table
      db.exec(`
        CREATE TABLE IF NOT EXISTS divisions (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          level INTEGER NOT NULL,
          parent_code TEXT,
          year INTEGER NOT NULL,
          status TEXT DEFAULT 'active',
          source_type TEXT DEFAULT 'official_nbs',
          confidence_score INTEGER DEFAULT 100,
          UNIQUE(code, year)
        );
        CREATE INDEX IF NOT EXISTS idx_parent ON divisions(parent_code);
        CREATE INDEX IF NOT EXISTS idx_year ON divisions(year);
      `);

      // Find and process files
      const gzFiles = await glob(`${inputDir}/*.json.gz`);
      let totalRecords = 0;

      for (const file of gzFiles) {
        const filename = path.basename(file);
        const yearMatch = filename.match(/(\d{4})\.json\.gz$/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;

        if (!year) continue;

        console.log(`Processing ${filename}...`);

        const chunks: Buffer[] = [];
        const readStream = createReadStream(file);
        const gunzip = createGunzip();

        await new Promise<void>((resolve, reject) => {
          readStream.pipe(gunzip);
          gunzip.on('data', (chunk) => chunks.push(chunk));
          gunzip.on('end', resolve);
          gunzip.on('error', reject);
        });

        const jsonContent = Buffer.concat(chunks).toString('utf-8');
        const data = JSON.parse(jsonContent);

        // Flatten tree
        function flattenTree(
          obj: Record<string, unknown>,
          parentCode: string | null = null
        ): Array<[string, string, number, string | null, number]> {
          const results: Array<[string, string, number, string | null, number]> = [];

          for (const [key, value] of Object.entries(obj)) {
            if (!/^\d{12}$/.test(key)) continue;

            const item = value as { name?: string; children?: Record<string, unknown> };
            const last6 = key.substring(6);
            const level = last6 === '000000' ? 2 : key.substring(8, 10) === '00' ? 3 : key.substring(10, 12) === '00' ? 4 : 5;

            results.push([key, item.name || '', level, parentCode, year]);

            if (item.children) {
              results.push(...flattenTree(item.children as Record<string, unknown>, key));
            }
          }

          return results;
        }

        const records = flattenTree(data);

        const insert = db.prepare(`
          INSERT OR REPLACE INTO divisions VALUES (?, ?, ?, ?, ?, 'active', 'official_nbs', 100)
        `);

        const insertMany = db.transaction((records) => {
          for (const record of records) {
            insert.run(...record);
          }
        });

        insertMany(records);
        console.log(`  -> ${records.length} records`);
        totalRecords += records.length;
      }

      console.log(`\nMigration complete: ${totalRecords} records`);
      db.close();
      break;
    }

    case 'export': {
      const year = args.find((a) => a.startsWith('--year='))?.split('=')[1];
      const output = args.find((a) => a.startsWith('--output='))?.split('=')[1];
      const cacheDir = args.find((a) => a.startsWith('--cache='))?.split('=')[1];

      if (!year) {
        console.error('Error: --year is required');
        console.error('Usage: cn-div export --year <YYYY> [--output <file>]');
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
        console.error('Usage: cn-div apply-patch --patch <file.json> [--dry-run]');
        process.exit(1);
      }

      await applyPatch({ patch: patchPath, cacheDir, dryRun });
      break;
    }

    case 'version':
    case '--version':
    case '-v': {
      console.log('@cn-division/cli v1.0.0');
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`
@cn-division/cli - Chinese Administrative Division Data CLI

Usage:
  cn-div <command> [options]

Commands:
  hydrate --year <YYYY>      Download and import data from NPM package
  migrate --input <dir>      Migrate legacy JSON data to SQLite
  export --year <YYYY>       Export data to CSV format
  apply-patch --patch <file> Apply a community patch to the database
  version                    Show version information
  help                       Show this help message

Examples:
  cn-div hydrate --year 2023
  cn-div hydrate --year 2023 --cache ~/.cn-division
  cn-div migrate --input ./legacy/data/GB2260 --output ./dist/data.db
  cn-div export --year 2023 --output ./2023.csv
  cn-div apply-patch --patch patches/2025/310115-update.json

For more information, visit:
  https://github.com/cn-division/china-administrative-division
`);
      break;
    }
  }
}

main().catch(console.error);
