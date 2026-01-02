/**
 * Hydrate Command
 *
 * Downloads and imports division data from NPM packages.
 *
 * Usage:
 *   cn-div hydrate --year 2023
 *   cn-div hydrate --year 2023 --cache ~/.cn-division/cache.db
 */

import Database from 'better-sqlite3';
import got from 'got';
import { pipeline } from 'stream/promises';
import tar from 'tar-stream';
import { createGunzip } from 'zlib';
import { mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { parse } from 'csv-parse/sync';

interface HydrateOptions {
  year: string;
  cacheDir?: string;
  verbose?: boolean;
}

interface TarballInfo {
  url: string;
  shasum: string;
}

/**
 * Get NPM tarball URL for a data package
 */
async function getTarballUrl(packageName: string): Promise<TarballInfo> {
  const response = await got(`https://registry.npmjs.org/${packageName}`, {
    responseType: 'json',
  });

  const body = response.body as {
    'dist-tags': { latest: string };
    versions: Record<string, { dist: { tarball: string; shasum: string } }>;
  };

  const latestVersion = body['dist-tags'].latest;
  const packageInfo = body.versions[latestVersion];

  if (!packageInfo) {
    throw new Error(`Package ${packageName} not found or has no valid versions`);
  }

  return {
    url: packageInfo.dist.tarball,
    shasum: packageInfo.dist.shasum,
  };
}

/**
 * Verify SHA checksum of downloaded data
 */
function verifyChecksum(data: Buffer, expectedSha: string): boolean {
  const hash = crypto.createHash('sha1');
  hash.update(data);
  const actualSha = hash.digest('hex');
  return actualSha === expectedSha;
}

/**
 * Initialize cache database
 */
function initCacheDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS divisions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      parent_code TEXT,
      year INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      source_type TEXT,
      confidence_score INTEGER,
      UNIQUE(code, year)
    );

    CREATE INDEX IF NOT EXISTS idx_parent ON divisions(parent_code);
    CREATE INDEX IF NOT EXISTS idx_year ON divisions(year);

    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

/**
 * CSV record interface
 */
interface CsvRecord {
  code: string;
  name: string;
  level: string;
  parent_code: string;
  year: string;
  status: string;
  source_type: string;
  confidence_score: string;
}

/**
 * Import CSV data into SQLite
 */
function importCsvToSqlite(db: Database.Database, csvContent: string, year: number): number {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as CsvRecord[];

  const insert = db.prepare(`
    INSERT OR REPLACE INTO divisions (
      code, name, level, parent_code, year,
      status, source_type, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((records) => {
    for (const record of records) {
      insert.run(
        record.code,
        record.name,
        parseInt(record.level, 10),
        record.parent_code || null,
        year,
        record.status || 'active',
        record.source_type || 'official_nbs',
        record.confidence_score ? parseInt(record.confidence_score, 10) : 100
      );
    }
  });

  insertMany(records);
  return records.length;
}

/**
 * Main hydrate function
 */
export async function hydrate(options: HydrateOptions): Promise<void> {
  const { year, cacheDir = path.join(os.homedir(), '.cn-division'), verbose = false } = options;

  console.log('='.repeat(60));
  console.log('Data Hydration Tool');
  console.log('='.repeat(60));
  console.log(`Year: ${year}`);
  console.log(`Cache directory: ${cacheDir}`);
  console.log('');

  const packageName = `@cn-division/source-${year}`;
  console.log(`Fetching package metadata: ${packageName}`);

  // Get tarball URL from NPM
  let tarballInfo: TarballInfo;
  try {
    tarballInfo = await getTarballUrl(packageName);
  } catch (err) {
    console.error(`Error: Package ${packageName} not found`);
    console.error('Please ensure the data package has been published to NPM.');
    return;
  }

  console.log(`Tarball URL: ${tarballInfo.url}`);

  // Ensure cache directory exists
  await mkdir(cacheDir, { recursive: true });

  const dbPath = path.join(cacheDir, 'cache.db');
  const db = initCacheDb(dbPath);

  // Check if we already have this version
  interface CacheMeta {
    key: string;
    value: string;
  }
  const existingHash = db.prepare('SELECT value FROM cache_meta WHERE key = ?').get(`shasum-${year}`) as CacheMeta | undefined;
  if (existingHash && existingHash.value === tarballInfo.shasum) {
    console.log(`Data for ${year} is already up to date (SHA verified)`);
    db.close();
    return;
  }

  // Download tarball
  console.log('Downloading data package...');
  const response = await got(tarballInfo.url, { responseType: 'buffer' });

  // Verify checksum
  if (!verifyChecksum(response.body, tarballInfo.shasum)) {
    console.error('Error: SHA checksum mismatch - possible corruption or tampering');
    db.close();
    return;
  }

  console.log('Checksum verified');

  // Extract and import
  console.log('Extracting data...');

  // Create extract stream
  const extract = tar.extract();
  let recordCount = 0;

  extract.on('entry', (header, stream, next) => {
    if (header.name.endsWith('.csv')) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const csvContent = Buffer.concat(chunks).toString('utf-8');
        recordCount = importCsvToSqlite(db, csvContent, parseInt(year, 10));
        next();
      });
    } else {
      stream.resume();
      next();
    }
  });

  await pipeline(
    got.stream(tarballInfo.url) as NodeJS.ReadableStream,
    createGunzip(),
    extract
  );

  // Update cache metadata
  db.prepare('INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, ?)').run(
    `shasum-${year}`,
    tarballInfo.shasum
  );
  db.prepare('INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, ?)').run(
    `updated-${year}`,
    new Date().toISOString()
  );

  console.log('');
  console.log('='.repeat(60));
  console.log(`Hydration complete: ${recordCount} records imported`);
  console.log('='.repeat(60));

  db.close();
}

/**
 * Export data from cache to CSV
 */
export async function exportFromCache(
  year: number,
  cacheDir: string = path.join(os.homedir(), '.cn-division'),
  outputPath?: string
): Promise<void> {
  const dbPath = path.join(cacheDir, 'cache.db');
  const db = new Database(dbPath);

  const records = db.prepare('SELECT * FROM divisions WHERE year = ?').all(year) as Array<{
    code: string;
    name: string;
    level: number;
    parent_code: string | null;
    year: number;
    status: string;
    source_type: string | null;
    confidence_score: number | null;
  }>;

  if (outputPath) {
    const { createWriteStream } = await import('fs');
    const ws = createWriteStream(outputPath);
    ws.write('code,name,level,parent_code,year,status,source_type,confidence_score\n');

    for (const record of records) {
      const line = [
        record.code,
        `"${record.name.replace(/"/g, '""')}"`,
        record.level,
        record.parent_code || '',
        record.year,
        record.status,
        record.source_type || '',
        record.confidence_score || 100,
      ].join(',');
      ws.write(line + '\n');
    }
    ws.end();
    console.log(`Exported ${records.length} records to ${outputPath}`);
  } else {
    // Output to stdout as CSV
    console.log('code,name,level,parent_code,year,status,source_type,confidence_score');
    for (const record of records) {
      console.log(
        `${record.code},"${record.name.replace(/"/g, '""')}",${record.level},${record.parent_code || ''},${record.year},${record.status},${record.source_type || ''},${record.confidence_score || 100}`
      );
    }
  }

  db.close();
}
