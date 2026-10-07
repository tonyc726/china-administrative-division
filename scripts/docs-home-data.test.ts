import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SIZE,
  buildLevelCounts,
  sampleVillages,
} from './docs-home-data.mjs';

const HISTORY = path.resolve('packages/source-history/data/divisions.csv');
const SNAPSHOT = path.resolve('packages/source-2023/data/divisions.csv');
const START = 1980;
const END = 2023;

interface Row {
  code: string;
  name: string;
  level: number;
  parent: string;
  year: number;
}

function readField(line: string, cursor: { index: number }) {
  const index = cursor.index;
  if (line[index] === '"') {
    cursor.index += 1;
    let value = '';
    while (cursor.index < line.length) {
      if (line[cursor.index] === '"') {
        cursor.index += 1;
        if (line[cursor.index] === '"') {
          value += '"';
          cursor.index += 1;
          continue;
        }
        break;
      }
      value += line[cursor.index];
      cursor.index += 1;
    }
    if (line[cursor.index] === ',') cursor.index += 1;
    return value;
  }
  const start = index;
  while (cursor.index < line.length && line[cursor.index] !== ',')
    cursor.index += 1;
  const value = line.slice(start, cursor.index);
  if (line[cursor.index] === ',') cursor.index += 1;
  return value;
}

function load(csvPath: string): Row[] {
  const text = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split('\n');
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!.replace(/\r$/, '');
    if (!line) continue;
    const cursor = { index: 0 };
    const code = readField(line, cursor);
    const name = readField(line, cursor);
    const level = Number(readField(line, cursor));
    const parent = readField(line, cursor);
    const year = Number(readField(line, cursor));
    if (!/^\d{12}$/.test(code) || !name || !Number.isInteger(level)) continue;
    rows.push({ code, name, level, parent, year });
  }
  return rows;
}

function structural(code: string, level: number) {
  const cuts = [2, 4, 6, 9, 12];
  return code.slice(0, cuts[level - 1]).padEnd(12, '0');
}

describe('docs home data matches the source CSVs', () => {
  it('has both CSVs materialized before asserting', () => {
    expect(existsSync(HISTORY), `缺少 ${HISTORY}`).toBe(true);
    expect(existsSync(SNAPSHOT), `缺少 ${SNAPSHOT}`).toBe(true);
  });

  it('plots real per-year counts and leaves gaps empty', () => {
    const history = readFileSync(HISTORY, 'utf8');
    const snapshot = readFileSync(SNAPSHOT, 'utf8');
    const historyRows = load(HISTORY);
    const snapshotRows = load(SNAPSHOT);
    const built = buildLevelCounts(history, snapshot);

    const raw = new Map<number, Map<number, number>>();
    const add = (row: Row) => {
      let byLevel = raw.get(row.year);
      if (!byLevel) {
        byLevel = new Map();
        raw.set(row.year, byLevel);
      }
      byLevel.set(row.level, (byLevel.get(row.level) ?? 0) + 1);
    };
    for (const row of historyRows) add(row);
    for (const row of snapshotRows) {
      if (row.year === 2023) add(row);
    }

    expect(built.startYear).toBe(START);
    expect(built.endYear).toBe(END);
    expect(built.levels).toHaveLength(5);
    for (const series of built.levels) {
      expect(series.counts).toHaveLength(END - START + 1);
      expect(series.counts.every((count) => count === null || count > 0)).toBe(
        true
      );
    }

    for (let year = START; year <= END; year += 1) {
      const index = year - START;
      const byLevel = raw.get(year);
      const province = byLevel?.get(1) ?? 0;
      const prefecture = byLevel?.get(2) ?? 0;
      const county = byLevel?.get(3) ?? 0;
      const fragment = province === 0 && prefecture === 0 && county > 0;
      for (const series of built.levels) {
        const actual = byLevel?.get(series.level) ?? 0;
        const plotted = series.counts[index];
        if (fragment || actual === 0) expect(plotted).toBeNull();
        else expect(plotted).toBe(actual);
      }
    }

    expect(built.omitted).toEqual([{ year: 2021, label: '县级', rows: 21 }]);
    expect(raw.get(2021)?.get(3)).toBe(21);
    expect(raw.get(2021)?.get(1) ?? 0).toBe(0);
    expect(built.emptyYears).toContain(2022);
    expect(raw.has(2022)).toBe(false);

    const y2023 = built.levels.map((series) => series.counts[2023 - START]);
    expect(y2023).toEqual([31, 342, 2975, 41351, 620572]);

    const names = (rows: Row[], year: number) =>
      new Set(
        rows
          .filter((row) => row.year === year && row.level === 1)
          .map((row) => row.name)
      );
    const historyNames = names(historyRows, 2020);
    const snapshotNames = names(snapshotRows, 2023);
    const onlyInHistory = [...historyNames]
      .filter((name) => !snapshotNames.has(name))
      .sort();
    expect(built.provinceGap).toMatchObject({
      historyCount: 34,
      snapshotCount: 31,
      fromYear: 2013,
      toYear: 2020,
    });
    expect(built.provinceGap?.onlyInHistory.slice().sort()).toEqual(
      onlyInHistory
    );
  });

  it('samples real 2023 village chains without duplicate codes', () => {
    const snapshot = readFileSync(SNAPSHOT, 'utf8');
    const rows = load(SNAPSHOT).filter((row) => row.year === 2023);
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const sample = sampleVillages(snapshot);
    const again = sampleVillages(snapshot);

    expect(sample.length).toBe(SAMPLE_SIZE);
    expect(sample.length).toBeGreaterThanOrEqual(500);
    expect(sample.length).toBeLessThanOrEqual(2000);
    expect(new Set(sample.map((entry) => entry.code)).size).toBe(sample.length);
    expect(sample.map((entry) => entry.code)).toEqual(
      again.map((entry) => entry.code)
    );

    for (const entry of sample) {
      expect(entry.code).toMatch(/^\d{12}$/);
      expect(entry.names).toHaveLength(5);
      for (let level = 1; level <= 5; level += 1) {
        const code = structural(entry.code, level);
        const row = byCode.get(code);
        expect(row, `${entry.code} 缺少 ${code}`).toBeTruthy();
        expect(row!.level).toBe(level);
        expect(row!.name).toBe(entry.names[level - 1]);
        if (level === 1) expect(row!.parent).toBe('');
        else expect(row!.parent).toBe(structural(entry.code, level - 1));
      }
    }
  }, 30_000);
});
