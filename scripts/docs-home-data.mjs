#!/usr/bin/env node
/**
 * 文档首页用的构建时数据。
 *
 * - hero-codes.json：2023 年村级实码的可复现抽样（懒加载，不进首屏包）
 * - hero-initial.json：抽样的第一条，供 SSR 首屏
 * - level-counts.json：1980–2023 各级条数。没有这一级的年份是 null，不补 0
 *
 * 2021 年历史文件只有县级残片（没有省、地）。画成 21 会像县级消失了，
 * 所以整年留空，并在 omitted 里记下残片条数。
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_2023 = path.join(root, 'packages/source-2023/data/divisions.csv');
const SOURCE_HISTORY = path.join(
  root,
  'packages/source-history/data/divisions.csv'
);
const PUBLIC_DIR = path.join(root, 'docs-site/public/data');
const GENERATED_DIR = path.join(
  root,
  'docs-site/.vitepress/theme/data/generated'
);

export const SAMPLE_SIZE = 1200;
export const SAMPLE_SEED = 2023;
export const START_YEAR = 1980;
export const END_YEAR = 2023;
export const SNAPSHOT_YEAR = 2023;

const RANKS = [
  { level: 1, label: '省级', short: '省', hint: '省/自治区/直辖市' },
  { level: 2, label: '地级', short: '地', hint: '地级市/州/盟' },
  { level: 3, label: '县级', short: '县', hint: '县/区/县级市' },
  { level: 4, label: '乡级', short: '乡', hint: '乡/镇/街道' },
  { level: 5, label: '村级', short: '村', hint: '村委会/居委会' },
];

const CUTS = [2, 4, 6, 9, 12];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, seed) {
  const random = mulberry32(seed);
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function readQuoted(line, index) {
  let end = index + 1;
  let value = '';
  while (end < line.length) {
    const quote = line.indexOf('"', end);
    if (quote < 0) return null;
    if (line[quote + 1] === '"') {
      value += `${line.slice(end, quote)}"`;
      end = quote + 2;
      continue;
    }
    value += line.slice(end, quote);
    let next = quote + 1;
    if (line[next] === ',') next += 1;
    return { value, index: next };
  }
  return null;
}

export function parseDivisionLine(line) {
  if (!line || line.length < 16) return null;
  const codeEnd = line.indexOf(',');
  if (codeEnd !== 12) return null;
  const code = line.slice(0, 12);
  let index = 13;
  let name = '';
  if (line[index] === '"') {
    const read = readQuoted(line, index);
    if (!read?.value) return null;
    name = read.value;
    index = read.index;
  } else {
    const comma = line.indexOf(',', index);
    if (comma < 0) return null;
    name = line.slice(index, comma);
    index = comma + 1;
  }
  const levelEnd = line.indexOf(',', index);
  if (levelEnd < 0) return null;
  const level = Number(line.slice(index, levelEnd));
  index = levelEnd + 1;
  const parentEnd = line.indexOf(',', index);
  if (parentEnd < 0) return null;
  const parent = line.slice(index, parentEnd);
  index = parentEnd + 1;
  const yearEnd = line.indexOf(',', index);
  const year = Number(line.slice(index, yearEnd < 0 ? line.length : yearEnd));
  if (!/^\d{12}$/.test(code) || !name || !Number.isInteger(level)) return null;
  return { code, name, level, parent, year };
}

function structuralCode(code, level) {
  return code.slice(0, CUTS[level - 1]).padEnd(12, '0');
}

export function parentChain(code, byCode) {
  if (!/^\d{12}$/.test(code)) return null;
  const names = [];
  for (let level = 1; level <= 5; level += 1) {
    const current = structuralCode(code, level);
    const row = byCode.get(current);
    if (!row || row.level !== level || row.name === '') return null;
    if (level === 1) {
      if (row.parent !== '') return null;
    } else if (row.parent !== structuralCode(code, level - 1)) {
      return null;
    }
    names.push(row.name);
  }
  const village = byCode.get(code);
  if (!village || village.level !== 5) return null;
  return names;
}

function consumeCsv(text, onRow) {
  const lines = text.replace(/^\uFEFF/, '').split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    let line = lines[i];
    if (!line) continue;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    const row = parseDivisionLine(line);
    if (row) onRow(row);
  }
}

function countYears(text) {
  /** @type {Map<number, Map<number, number>>} */
  const counts = new Map();
  /** @type {Map<number, Map<string, string>>} */
  const provinces = new Map();
  consumeCsv(text, (row) => {
    if (!Number.isInteger(row.year)) return;
    let byLevel = counts.get(row.year);
    if (!byLevel) {
      byLevel = new Map();
      counts.set(row.year, byLevel);
    }
    byLevel.set(row.level, (byLevel.get(row.level) ?? 0) + 1);
    if (row.level === 1) {
      let names = provinces.get(row.year);
      if (!names) {
        names = new Map();
        provinces.set(row.year, names);
      }
      names.set(row.code, row.name);
    }
  });
  return { counts, provinces };
}

function isFragmentYear(byLevel) {
  const province = byLevel?.get(1) ?? 0;
  const prefecture = byLevel?.get(2) ?? 0;
  const county = byLevel?.get(3) ?? 0;
  return province === 0 && prefecture === 0 && county > 0;
}

function sameNameList(left, right) {
  if (left.length !== right.length) return false;
  return left.every((name, index) => name === right[index]);
}

function buildProvinceGap(historyProvinces, snapshotProvinces, historyCounts) {
  const snapshotNames = new Set(snapshotProvinces.values());
  const snapshotCount = snapshotProvinces.size;
  /** @type {number[]} */
  const years = [];
  /** @type {string[] | null} */
  let extras = null;
  let historyCount = 0;
  for (const [year, names] of historyProvinces) {
    const count = historyCounts.get(year)?.get(1) ?? 0;
    if (count <= snapshotCount) continue;
    const only = [...names.entries()]
      .filter(([, name]) => !snapshotNames.has(name))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, name]) => name);
    if (!extras) {
      extras = only;
      historyCount = count;
    } else if (count !== historyCount || !sameNameList(extras, only)) {
      return null;
    }
    years.push(year);
  }
  if (!years.length || !extras?.length) return null;
  years.sort((a, b) => a - b);
  for (let i = 1; i < years.length; i += 1) {
    if (years[i] !== years[i - 1] + 1) return null;
  }
  return {
    historyCount,
    snapshotCount,
    fromYear: years[0],
    toYear: years[years.length - 1],
    onlyInHistory: extras,
  };
}

export function buildLevelCounts(historyText, snapshotText) {
  const history = countYears(historyText);
  const snapshot = countYears(snapshotText);
  const omitted = [];
  const emptyYears = [];
  const levels = RANKS.map((rank) => ({
    level: rank.level,
    label: rank.label,
    short: rank.short,
    hint: rank.hint,
    counts: /** @type {(number | null)[]} */ ([]),
  }));

  for (let year = START_YEAR; year <= END_YEAR; year += 1) {
    const source = year === SNAPSHOT_YEAR ? snapshot.counts : history.counts;
    const byLevel = source.get(year);
    const total = byLevel
      ? [...byLevel.values()].reduce((sum, n) => sum + n, 0)
      : 0;
    if (isFragmentYear(byLevel)) {
      const county = byLevel.get(3) ?? 0;
      omitted.push({ year, label: '县级', rows: county });
      for (const series of levels) series.counts.push(null);
      continue;
    }
    if (total === 0) {
      emptyYears.push(year);
      for (const series of levels) series.counts.push(null);
      continue;
    }
    for (const series of levels) {
      const n = byLevel?.get(series.level) ?? 0;
      series.counts.push(n > 0 ? n : null);
    }
  }

  const snapshotProvinces = snapshot.provinces.get(SNAPSHOT_YEAR) ?? new Map();
  return {
    startYear: START_YEAR,
    endYear: END_YEAR,
    snapshotYear: SNAPSHOT_YEAR,
    levels,
    omitted,
    emptyYears,
    provinceGap: buildProvinceGap(
      history.provinces,
      snapshotProvinces,
      history.counts
    ),
  };
}

export function sampleVillages(
  snapshotText,
  size = SAMPLE_SIZE,
  seed = SAMPLE_SEED
) {
  /** @type {Map<string, { name: string, level: number, parent: string }>} */
  const byCode = new Map();
  /** @type {string[]} */
  const villages = [];
  consumeCsv(snapshotText, (row) => {
    if (row.year !== SNAPSHOT_YEAR) return;
    byCode.set(row.code, {
      name: row.name,
      level: row.level,
      parent: row.parent,
    });
    if (row.level === 5) villages.push(row.code);
  });
  const valid = [];
  const seen = new Set();
  for (const code of villages) {
    if (seen.has(code)) continue;
    seen.add(code);
    const names = parentChain(code, byCode);
    if (!names) continue;
    valid.push({ code, names });
  }
  if (valid.length < size) {
    throw new Error(`可用村级码只有 ${valid.length}，少于抽样 ${size}`);
  }
  return shuffle(valid, seed).slice(0, size);
}

export async function buildHomeData() {
  const [historyText, snapshotText] = await Promise.all([
    readFile(SOURCE_HISTORY, 'utf8'),
    readFile(SOURCE_2023, 'utf8'),
  ]);
  const sample = sampleVillages(snapshotText);
  const levelCounts = buildLevelCounts(historyText, snapshotText);
  const initial = sample[0];
  return { sample, initial, levelCounts };
}

export async function writeHomeData(data = undefined) {
  const built = data ?? (await buildHomeData());
  await mkdir(PUBLIC_DIR, { recursive: true });
  await mkdir(GENERATED_DIR, { recursive: true });
  const codes = built.sample.map((entry) => [entry.code, ...entry.names]);
  await writeFile(
    path.join(PUBLIC_DIR, 'hero-codes.json'),
    JSON.stringify({ codes })
  );
  await writeFile(
    path.join(GENERATED_DIR, 'hero-initial.json'),
    `${JSON.stringify({ code: built.initial.code, names: built.initial.names }, null, 2)}\n`
  );
  await writeFile(
    path.join(GENERATED_DIR, 'level-counts.json'),
    `${JSON.stringify(built.levelCounts, null, 2)}\n`
  );
  return built;
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const built = await writeHomeData();
  const file = path.join(PUBLIC_DIR, 'hero-codes.json');
  const { size } = await stat(file);
  const ranges = built.levelCounts.levels
    .map((series) => {
      const years = series.counts.flatMap((count, index) =>
        count == null ? [] : [START_YEAR + index]
      );
      const first = years[0];
      const last = years[years.length - 1];
      return `${series.label} ${first ?? '无'}–${last ?? '无'}（${years.length} 年）`;
    })
    .join('\n  ');
  console.log(
    `sample ${built.sample.length} initial ${built.initial.code} ${built.initial.names.join('/')}\n  ${ranges}\nomitted ${JSON.stringify(built.levelCounts.omitted)}\nempty ${built.levelCounts.emptyYears.join(',')}\nprovinceGap ${JSON.stringify(built.levelCounts.provinceGap)}\nhero-codes.json ${size} bytes`
  );
}
