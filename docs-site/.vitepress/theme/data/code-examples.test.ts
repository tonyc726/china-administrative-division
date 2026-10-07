import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CITY_PLACEHOLDERS,
  CODE_EXAMPLES,
  RANKS,
  SEGMENT_LENGTHS,
  type CodeExample,
} from './code-examples';

const CSV_PATH = path.resolve('packages/source-2023/data/divisions.csv');

interface Division {
  code: string;
  name: string;
  level: number;
  parent: string;
}

function parseRow(line: string): Division | null {
  if (!line) return null;
  let index = 0;
  const read = () => {
    if (line[index] === '"') {
      index += 1;
      let value = '';
      while (index < line.length) {
        if (line[index] === '"') {
          index += 1;
          if (line[index] === '"') {
            value += '"';
            index += 1;
            continue;
          }
          break;
        }
        value += line[index];
        index += 1;
      }
      if (line[index] === ',') index += 1;
      return value;
    }
    const start = index;
    while (index < line.length && line[index] !== ',') index += 1;
    const value = line.slice(start, index);
    if (line[index] === ',') index += 1;
    return value;
  };
  const code = read();
  const name = read();
  const level = Number(read());
  const parent = read();
  if (!/^\d{12}$/.test(code)) return null;
  return { code, name, level, parent };
}

function loadDivisions(csvPath: string): Map<string, Division> {
  const text = readFileSync(csvPath, 'utf8');
  const lines = text.split('\n');
  const map = new Map<string, Division>();
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseRow(lines[i]!.replace(/\r$/, ''));
    if (row) map.set(row.code, row);
  }
  return map;
}

function levelCode(example: CodeExample, level: number): string {
  if (level === 1) return `${example.code.slice(0, 2)}0000000000`;
  if (level === 2) return `${example.code.slice(0, 4)}00000000`;
  if (level === 3) return `${example.code.slice(0, 6)}000000`;
  if (level === 4) return `${example.code.slice(0, 9)}000`;
  return example.code;
}

describe('docs home code examples match source-2023', () => {
  it('has the CSV materialized before asserting', () => {
    expect(
      existsSync(CSV_PATH),
      `缺少 ${CSV_PATH}。CI 在 pnpm test 之前要先跑 fetch-data-csvs。`,
    ).toBe(true);
  });

  it('checks every rotated village against the 2023 parent chain', () => {
    const divisions = loadDivisions(CSV_PATH);
    expect(CODE_EXAMPLES.length).toBeGreaterThanOrEqual(5);
    expect(CODE_EXAMPLES.length).toBeLessThanOrEqual(6);

    const provinces = new Set<string>();
    let placeholderCities = 0;

    for (const example of CODE_EXAMPLES) {
      expect(example.code).toMatch(/^\d{12}$/);
      expect(example.segments.map((segment) => segment.digits).join('')).toBe(
        example.code,
      );
      expect(example.segments.map((segment) => segment.rank)).toEqual([
        ...RANKS,
      ]);
      provinces.add(example.code.slice(0, 2));

      example.segments.forEach((segment, index) => {
        expect(segment.digits).toHaveLength(SEGMENT_LENGTHS[index]!);
        const code = levelCode(example, index + 1);
        const row = divisions.get(code);
        expect(row, `${example.code} 缺少 ${code}`).toBeTruthy();
        expect(row!.name).toBe(segment.name);
        expect(row!.level).toBe(index + 1);
        if (index === 0) {
          expect(row!.parent).toBe('');
        } else {
          expect(row!.parent).toBe(levelCode(example, index));
        }
      });

      const city = example.segments[1]!.name;
      if ((CITY_PLACEHOLDERS as readonly string[]).includes(city)) {
        placeholderCities += 1;
        expect(example.region).toBe('直辖市');
        expect(example.segments[0]!.name).toBe('北京市');
      }
    }

    expect(placeholderCities).toBe(1);
    expect(provinces).toEqual(new Set(['33', '44', '51', '23', '54', '11']));
    expect(CODE_EXAMPLES.map((example) => example.region)).toEqual([
      '东部',
      '南部',
      '西部',
      '北部',
      '自治区',
      '直辖市',
    ]);
    expect(CODE_EXAMPLES.some((example) => example.segments[0]!.name.includes('自治区'))).toBe(
      true,
    );
  });
});
