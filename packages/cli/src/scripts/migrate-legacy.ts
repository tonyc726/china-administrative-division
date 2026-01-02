/**
 * Legacy Data Migration Script
 *
 * Migrates GB2260 JSON data from the legacy format to SQLite.
 *
 * Usage:
 *   pnpm migrate --input ../../legacy/data/GB2260 --output ./dist/source-history.db
 */

import Database from 'better-sqlite3';
import { createGunzip } from 'zlib';
import { createReadStream } from 'fs';
import { mkdir } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CLI arguments parsing
const args = process.argv.slice(2);
const inputDir =
  args.find((a) => a.startsWith('--input='))?.split('=')[1] ||
  './legacy/data/GB2260';
const outputPath =
  args.find((a) => a.startsWith('--output='))?.split('=')[1] ||
  './dist/source-history.db';

// Database schema
const SCHEMA = `
CREATE TABLE IF NOT EXISTS divisions (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    parent_code TEXT,
    year INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    source_type TEXT DEFAULT 'official_nbs',
    confidence_score INTEGER DEFAULT 100,
    urban_rural_code TEXT,
    UNIQUE(code, year)
);

CREATE INDEX IF NOT EXISTS idx_parent ON divisions(parent_code);
CREATE INDEX IF NOT EXISTS idx_year ON divisions(year);
CREATE INDEX IF NOT EXISTS idx_level ON divisions(level);
CREATE INDEX IF NOT EXISTS idx_source ON divisions(source_type);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);
`;

/**
 * Initialize SQLite database
 */
function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Insert metadata
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    'migrated_at',
    new Date().toISOString()
  );

  return db;
}

/**
 * Determine division level from code (handles 6 or 12 digit codes)
 */
function getLevelFromCode(code: string): number {
  // Pad to 12 digits if needed
  const paddedCode = code.padEnd(12, '0');

  // Province: xx0000000000 (2 digits + 10 zeros)
  const last10 = paddedCode.substring(2);
  if (last10 === '0000000000') return 1;

  const last6 = paddedCode.substring(6);
  if (last6 === '000000') return 2; // City

  const last4 = paddedCode.substring(8);
  if (last4 === '0000') return 3; // County

  const last2 = paddedCode.substring(10);
  if (last2 === '00') return 4; // Township

  return 5; // Village
}

/**
 * Get parent code from child code (handles 6 or 12 digit codes)
 */
function getParentCode(code: string): string | null {
  // Pad to 12 digits
  const paddedCode = code.padEnd(12, '0');
  const level = getLevelFromCode(paddedCode);

  if (level === 1) return null; // Province has no parent
  if (level === 2) return paddedCode.substring(0, 2) + '0000000000'; // City -> Province
  if (level === 3) return paddedCode.substring(0, 4) + '00000000'; // County -> City
  if (level === 4) return paddedCode.substring(0, 6) + '000000'; // Township -> County
  if (level === 5) return paddedCode.substring(0, 8) + '00'; // Village -> Township

  return null;
}

/**
 * Normalize code to 12 digits
 */
function normalizeCode(code: string): string {
  return code.trim().padEnd(12, '0');
}

/**
 * Process flat array format: [{ code: "110000", name: "北京市" }, ...]
 */
function processFlatArray(
  items: Array<{ code?: unknown; name?: unknown }>,
  year: number
): Array<{
  code: string;
  name: string;
  level: number;
  parent_code: string | null;
  year: number;
  status: string;
  source_type: string;
  confidence_score: number;
}> {
  const results: Array<{
    code: string;
    name: string;
    level: number;
    parent_code: string | null;
    year: number;
    status: string;
    source_type: string;
    confidence_score: number;
  }> = [];

  for (const item of items) {
    if (!item.code || typeof item.code !== 'string') continue;

    const code = item.code.trim();
    // Accept codes from 2 to 12 digits
    if (!/^\d{2,12}$/.test(code)) continue;

    const normalizedCode = normalizeCode(code);
    const level = getLevelFromCode(normalizedCode);
    const parentCode = getParentCode(normalizedCode);

    results.push({
      code: normalizedCode,
      name: typeof item.name === 'string' ? item.name.trim() : '',
      level,
      parent_code: parentCode,
      year,
      status: 'active',
      source_type: 'official_nbs',
      confidence_score: 100,
    });
  }

  return results;
}

/**
 * Process a single JSON.GZ file
 */
async function processGzFile(
  filePath: string,
  db: Database.Database
): Promise<number> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const readStream = createReadStream(filePath);
    const gunzip = createGunzip();

    readStream.pipe(gunzip);

    gunzip.on('data', (chunk) => chunks.push(chunk));
    gunzip.on('end', () => {
      try {
        const jsonContent = Buffer.concat(chunks).toString('utf-8');
        const data = JSON.parse(jsonContent);

        // Extract year from filename (e.g., "2021.json.gz" -> 2021)
        const filename = path.basename(filePath);
        const yearMatch = filename.match(/(\d{4})\.json\.gz$/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;

        if (!year) {
          console.warn(`Could not extract year from filename: ${filename}`);
          resolve(0);
          return;
        }

        // Determine data format and process
        let records: Array<{
          code: string;
          name: string;
          level: number;
          parent_code: string | null;
          year: number;
          status: string;
          source_type: string;
          confidence_score: number;
        }> = [];

        if (Array.isArray(data)) {
          // Flat array format
          records = processFlatArray(data, year);
        } else if (typeof data === 'object' && data !== null) {
          // Tree format (not implemented, but here for reference)
          console.warn(`Tree format not yet supported: ${filename}`);
          resolve(0);
          return;
        } else {
          console.warn(`Unknown data format in: ${filename}`);
          resolve(0);
          return;
        }

        // Batch insert
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
              record.level,
              record.parent_code,
              record.year,
              record.status,
              record.source_type,
              record.confidence_score
            );
          }
        });

        insertMany(records);
        console.log(`Processed ${filename}: ${records.length} records`);
        resolve(records.length);
      } catch (err) {
        reject(err);
      }
    });

    gunzip.on('error', reject);
  });
}

/**
 * Find all data files in the input directory
 */
async function findDataFiles(dir: string): Promise<string[]> {
  // From packages/cli/src/scripts to project root:
  // src -> scripts -> cli -> packages -> project-root (4 levels up)
  const projectRoot = path.resolve(__dirname, '../../../..');
  const absoluteDir = path.isAbsolute(dir) ? dir : path.join(projectRoot, dir);

  const gzFiles = await glob(`${absoluteDir}/*.json.gz`);
  const jsonFiles = await glob(`${absoluteDir}/*.json`);
  return [...gzFiles, ...jsonFiles].sort();
}

/**
 * Main migration function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Legacy Data Migration Tool');
  console.log('='.repeat(60));
  console.log(`Input directory: ${inputDir}`);
  console.log(`Output database: ${outputPath}`);
  console.log('');

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await mkdir(outputDir, { recursive: true });

  // Initialize database
  const db = initDatabase(outputPath);
  console.log('Database initialized');

  // Find data files
  const files = await findDataFiles(inputDir);
  console.log(`Found ${files.length} data files`);
  console.log('');

  // Process each file
  let totalRecords = 0;
  for (const file of files) {
    try {
      const count = await processGzFile(file, db);
      totalRecords += count;
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Migration complete: ${totalRecords} records imported`);
  console.log('='.repeat(60));

  // Verify
  const { count } = db
    .prepare('SELECT COUNT(*) as count FROM divisions')
    .get() as { count: number };
  console.log(`Verified in database: ${count} records`);

  db.close();
}

main().catch(console.error);
