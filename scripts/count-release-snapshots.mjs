#!/usr/bin/env node
/**
 * 从 GitHub Release `data-snapshot-2023` 的两个 sqlite 归档数各级条数，
 * 写成 scripts/data/release-level-counts.json。文档构建读这份清单，
 * 不再在 CI 里下载约 200MB 的 NBS 库。
 *
 *   gh release download data-snapshot-2023 -R tonyc726/china-administrative-division \
 *     -p gb2260-sqlite-1980-2023.tar.gz -p nbs-sqlite-2009-2023.tar.gz -D /tmp/cndiv-snap
 *   tar -xzf /tmp/cndiv-snap/gb2260-sqlite-1980-2023.tar.gz -C /tmp/cndiv-snap/gb
 *   tar -xzf /tmp/cndiv-snap/nbs-sqlite-2009-2023.tar.gz -C /tmp/cndiv-snap/nbs
 *   node scripts/count-release-snapshots.mjs /tmp/cndiv-snap/gb /tmp/cndiv-snap/nbs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'scripts/data/release-level-counts.json');
const [gbDir, nbsDir] = process.argv.slice(2);

if (!gbDir || !nbsDir) {
  console.error(
    '用法: node scripts/count-release-snapshots.mjs <GB2260目录> <NBS目录>'
  );
  process.exit(1);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function scalar(dbFile, sql) {
  return execFileSync('sqlite3', [dbFile, sql], { encoding: 'utf8' }).trim();
}

function count(dbFile, table) {
  return Number(scalar(dbFile, `SELECT count(*) FROM ${table};`));
}

const gbYears = {};
const hashes = new Map();
for (let year = 1980; year <= 2023; year += 1) {
  const file = path.join(gbDir, `GB2260.${year}.sqlite`);
  hashes.set(year, sha256(file));
  const extraProvinces = scalar(
    file,
    "SELECT name FROM province WHERE code IN ('710000','810000','820000') ORDER BY code;"
  )
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  gbYears[year] = {
    counts: [
      count(file, 'province'),
      count(file, 'city'),
      count(file, 'county'),
    ],
    ...(extraProvinces.length ? { extraProvinces } : {}),
  };
}

const duplicates = [];
for (let year = 1981; year <= 2023; year += 1) {
  if (hashes.get(year) === hashes.get(year - 1)) {
    duplicates.push({ year, sameAs: year - 1 });
  }
}
const duplicateYears = new Set(duplicates.map((item) => item.year));
for (const year of duplicateYears) delete gbYears[year];

const nbsYears = {};
for (let year = 2009; year <= 2023; year += 1) {
  const file = path.join(nbsDir, `NBS.${year}.sqlite`);
  nbsYears[year] = [
    count(file, 'province'),
    count(file, 'city'),
    count(file, 'area'),
    count(file, 'street'),
    count(file, 'village'),
  ];
}

const payload = {
  release: 'data-snapshot-2023',
  gb2260: {
    asset: 'gb2260-sqlite-1980-2023.tar.gz',
    tables: ['province', 'city', 'county'],
    duplicates,
    years: gbYears,
  },
  nbs: {
    asset: 'nbs-sqlite-2009-2023.tar.gz',
    tables: ['province', 'city', 'area', 'street', 'village'],
    years: nbsYears,
  },
};

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  `wrote ${outFile} gb2260 ${Object.keys(gbYears).length} years, duplicates ${duplicates.map((item) => item.year).join(',')}, nbs ${Object.keys(nbsYears).length} years`
);
