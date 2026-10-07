#!/usr/bin/env node
/**
 * 文档首页用的构建时数据。
 *
 * - hero-codes.json：2023 年村级实码的可复现抽样（懒加载，不进首屏包）
 * - hero-initial.json：抽样的第一条，供 SSR 首屏
 * - level-counts.json：1980–2023 各级条数。没有这一级的年份是 null，不补 0
 *
 * 历史 CSV 里 2021 年只有县级残片。省、地、县图用 Release 里的 GB2260
 * 年度库，1980–2023 每年都有柱。2008、2022 与上一年字节相同，沿用上一年
 * 的条数（当年没有公布变更）。乡、村用 NBS 年度库（2009–2022）；
 * 2023 年乡、村仍用已发布的 source-2023 CSV。2023 年省、地、县不改用
 * NBS 县级，避免和 GB2260 接成假台阶。
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
const RELEASE_COUNTS = path.join(
  root,
  'scripts/data/release-level-counts.json'
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

/** 省级条数发生变化、且能在历史 CSV 的省名里对上的年份。 */
const PROVINCE_EVENTS = {
  1988: '海南建省',
  1997: '重庆直辖',
  2013: '含台港澳',
};

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

/**
 * 把 Release 里数出来的条数补进 CSV 图。
 * 只填 CSV 留空的省、地、县，以及 2023 以外的乡、村。
 * 不拿 NBS 的省、地、县覆盖 GB2260。
 */
export function applyReleaseCounts(levelCounts, release) {
  const levels = levelCounts.levels.map((series) => ({
    ...series,
    counts: series.counts.slice(),
  }));
  const span = levels[0].counts.length;
  const at = (year) => year - levelCounts.startYear;

  const nbsTownshipYears = [];
  for (const [yearText, counts] of Object.entries(release.nbs.years)) {
    const year = Number(yearText);
    const index = at(year);
    if (!Number.isInteger(year) || index < 0 || index >= span) continue;
    if (year === levelCounts.snapshotYear) continue;
    const township = counts[3] ?? 0;
    const village = counts[4] ?? 0;
    if (township > 0) levels[3].counts[index] = township;
    if (village > 0) levels[4].counts[index] = village;
    if (township > 0 || village > 0) nbsTownshipYears.push(year);
  }

  const gb2260FilledYears = [];
  const gb2260Extras = [];
  for (const [yearText, entry] of Object.entries(release.gb2260.years)) {
    const year = Number(yearText);
    const index = at(year);
    if (!Number.isInteger(year) || index < 0 || index >= span) continue;
    const upperMissing = [0, 1, 2].every(
      (level) => levels[level].counts[index] == null
    );
    if (!upperMissing) continue;
    const counts = entry.counts;
    for (let level = 0; level < 3; level += 1) {
      const n = counts[level] ?? 0;
      levels[level].counts[index] = n > 0 ? n : null;
    }
    gb2260FilledYears.push(year);
    if (entry.extraProvinces?.length) {
      gb2260Extras.push({ year, names: entry.extraProvinces });
    }
  }

  const carried = [];
  for (const dup of release.gb2260.duplicates ?? []) {
    const index = at(dup.year);
    const source = release.gb2260.years[String(dup.sameAs)];
    if (!source || index < 0 || index >= span) continue;
    const upperMissing = [0, 1, 2].every(
      (level) => levels[level].counts[index] == null
    );
    if (upperMissing) {
      for (let level = 0; level < 3; level += 1) {
        const n = source.counts[level] ?? 0;
        levels[level].counts[index] = n > 0 ? n : null;
      }
    }
    carried.push({ year: dup.year, sameAs: dup.sameAs });
  }

  const filled = new Set(gb2260FilledYears);
  const csvFragments = levelCounts.omitted.filter((item) =>
    filled.has(item.year)
  );
  const omitted = levelCounts.omitted.filter((item) => !filled.has(item.year));
  const emptyYears = [];
  for (let index = 0; index < span; index += 1) {
    if (levels.every((series) => series.counts[index] == null)) {
      emptyYears.push(levelCounts.startYear + index);
    }
  }

  const gbAdminAt = (year) => {
    const direct = release.gb2260.years[String(year)];
    if (direct) return direct.counts.slice(0, 3);
    const dup = (release.gb2260.duplicates ?? []).find(
      (item) => item.year === year
    );
    if (!dup) return null;
    const source = release.gb2260.years[String(dup.sameAs)];
    return source ? source.counts.slice(0, 3) : null;
  };

  const adminCounts = [[], [], []];
  for (let year = levelCounts.startYear; year <= levelCounts.endYear; year += 1) {
    const counts = gbAdminAt(year);
    if (!counts || counts.some((count) => !(count > 0))) {
      throw new Error(`GB2260 ${year} 年省、地、县不完整`);
    }
    counts.forEach((count, level) => adminCounts[level].push(count));
  }

  const events = [];
  for (let year = levelCounts.startYear + 1; year <= levelCounts.endYear; year += 1) {
    const label = PROVINCE_EVENTS[year];
    if (!label) continue;
    const index = year - levelCounts.startYear;
    if (adminCounts[0][index] === adminCounts[0][index - 1]) continue;
    events.push({ year, label });
  }

  const localFrom = 2009;
  const localCounts = [[], []];
  for (let year = localFrom; year <= levelCounts.endYear; year += 1) {
    const index = at(year);
    const township = levels[3].counts[index];
    const village = levels[4].counts[index];
    if (!(township > 0) || !(village > 0)) {
      throw new Error(`NBS ${year} 年乡、村不完整`);
    }
    localCounts[0].push(township);
    localCounts[1].push(village);
  }

  const snapIndex = at(levelCounts.snapshotYear);
  const chart = {
    adminStart: levelCounts.startYear,
    adminEnd: levelCounts.endYear,
    admin: [0, 1, 2].map((level) => ({
      ...RANKS[level],
      counts: adminCounts[level],
    })),
    localStart: localFrom,
    localEnd: levelCounts.endYear,
    local: [0, 1].map((offset) => ({
      ...RANKS[offset + 3],
      counts: localCounts[offset],
    })),
    carried,
    events,
    publishedAdmin2023: [0, 1, 2].map(
      (level) => levels[level].counts[snapIndex]
    ),
  };

  return {
    ...levelCounts,
    levels,
    omitted,
    emptyYears,
    chart,
    sources: {
      release: release.release,
      nbsTownshipYears: nbsTownshipYears.sort((a, b) => a - b),
      gb2260FilledYears: gb2260FilledYears.sort((a, b) => a - b),
      gb2260Extras,
      csvFragments,
      gb2260Duplicates: release.gb2260.duplicates,
      nbsSnapshotSqlite:
        release.nbs.years[String(levelCounts.snapshotYear)] ?? null,
    },
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
  const release = JSON.parse(await readFile(RELEASE_COUNTS, 'utf8'));
  const levelCounts = applyReleaseCounts(
    buildLevelCounts(historyText, snapshotText),
    release
  );
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
