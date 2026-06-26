/**
 * Hydrate Command
 *
 * Downloads and imports division data from NPM packages.
 *
 * Usage:
 *   cndiv hydrate --year 2023
 *   cndiv hydrate --year 2023 --cache ~/.cndiv/cache.db
 */

import Database from 'better-sqlite3';
import got from 'got';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import tar from 'tar-stream';
import { createGunzip } from 'zlib';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { parse } from 'csv-parse/sync';
import { DATABASE_SCHEMA } from '@cndiv/data-protocol';

interface HydrateOptions {
  year: string;
  cacheDir?: string;
  verbose?: boolean;
  /** 离线注水：直接从本地 gzip tarball(.tgz) 读取，跳过 NPM */
  tarball?: string;
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

  // 复用 data-protocol 的权威 schema（divisions/metadata/patch_history），
  // 避免与 DATABASE_SCHEMA 漂移，并确保 apply-patch 依赖的 patch_history 表存在。
  db.exec(DATABASE_SCHEMA);

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

interface SourceManifest {
  file: string;
  sha512: string;
  rows?: number;
}

/**
 * 从 gzip tarball buffer 中解包并把所有 .csv 导入 SQLite，返回导入行数。
 * 供 NPM 注水与离线 --tarball 注水共用。
 *
 * 若包内含 manifest.json，则按其 SHA-512 校验对应 CSV（FMEA：离线注水无 registry shasum，
 * manifest 是其唯一完整性凭据）；不符即抛错，杜绝把损坏/被篡改的数据静默灌入缓存。
 */
async function extractAndImport(
  db: Database.Database,
  gzBuffer: Buffer,
  year: number
): Promise<{ recordCount: number; verified: boolean | null }> {
  const extract = tar.extract();
  let recordCount = 0;
  let manifestRaw: string | null = null;
  const csvSha = new Map<string, string>();

  extract.on('entry', (header, stream, next) => {
    const base = path.basename(header.name);
    if (base === 'manifest.json') {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        manifestRaw = Buffer.concat(chunks).toString('utf-8');
        next();
      });
    } else if (header.name.endsWith('.csv')) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const buf = Buffer.concat(chunks);
        csvSha.set(base, crypto.createHash('sha512').update(buf).digest('hex'));
        recordCount += importCsvToSqlite(db, buf.toString('utf-8'), year);
        next();
      });
    } else {
      stream.resume();
      next();
    }
  });

  await pipeline(Readable.from(gzBuffer), createGunzip(), extract);

  let verified: boolean | null = null;
  if (manifestRaw) {
    const manifest = JSON.parse(manifestRaw) as SourceManifest;
    const actual = csvSha.get(path.basename(manifest.file));
    verified = actual === manifest.sha512;
    if (!verified) {
      throw new Error(
        `manifest 完整性校验失败：${manifest.file} 的 SHA-512 与 manifest 不符（数据可能损坏或被篡改），已中止注水`
      );
    }
  }

  return { recordCount, verified };
}

/**
 * Main hydrate function
 */
export async function hydrate(options: HydrateOptions): Promise<void> {
  const { year, cacheDir = path.join(os.homedir(), '.cndiv'), tarball } = options;

  console.log('='.repeat(60));
  console.log('Data Hydration Tool');
  console.log('='.repeat(60));
  console.log(`Year: ${year}`);
  console.log(`Cache directory: ${cacheDir}`);
  console.log('');

  // 离线注水：从本地 .tgz 直接解包导入，跳过 NPM（适合直接消费 GitHub Release 附件）
  if (tarball) {
    await mkdir(cacheDir, { recursive: true });
    const db = initCacheDb(path.join(cacheDir, 'cache.db'));
    console.log(`Importing from local tarball: ${tarball}`);
    const buf = await readFile(tarball);
    const { recordCount: count, verified } = await extractAndImport(db, buf, parseInt(year, 10));
    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(`tarball-${year}`, tarball);
    console.log('');
    console.log('='.repeat(60));
    console.log(`Hydration complete (offline): ${count} records imported`);
    console.log(
      verified === true
        ? 'Integrity: manifest SHA-512 verified ✅'
        : 'Integrity: no manifest.json in package (skipped)'
    );
    console.log('='.repeat(60));
    db.close();
    return;
  }

  const packageName = `@cndiv/source-${year}`;
  console.log(`Fetching package metadata: ${packageName}`);

  // Get tarball URL from NPM
  let tarballInfo: TarballInfo;
  try {
    tarballInfo = await getTarballUrl(packageName);
  } catch {
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
  const existingHash = db.prepare('SELECT value FROM metadata WHERE key = ?').get(`shasum-${year}`) as CacheMeta | undefined;
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

  // Extract and import — 从已下载且通过 SHA 校验的 buffer 解包，保证"入库内容 === 已校验内容"
  console.log('Extracting data...');
  const { recordCount } = await extractAndImport(db, response.body, parseInt(year, 10));

  // Update cache metadata
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    `shasum-${year}`,
    tarballInfo.shasum
  );
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
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
  cacheDir: string = path.join(os.homedir(), '.cndiv'),
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
    const { createWriteStream, mkdirSync } = await import('fs');
    mkdirSync(path.dirname(outputPath), { recursive: true });
    // 等待写流真正 flush+close，避免调用方在文件落盘前读取（导出/回灌的竞态）
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(outputPath);
      ws.on('error', reject);
      ws.on('finish', () => resolve());
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
    });
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
