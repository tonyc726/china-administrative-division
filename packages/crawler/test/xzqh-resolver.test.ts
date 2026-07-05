/**
 * buildCacheResolver（2.2）单测。
 *
 * 用临时 better-sqlite3 库造一个最小 cache.db fixture（divisions 表 + 复合主键 (code,year)），
 * 覆盖生产 resolver 的核心不变量：
 *   - 唯一名 → 命中单码
 *   - 同名歧义（多候选）→ 返回 null + 记入 ambiguous 全候选（绝不臆造）
 *   - 占位层（市辖区/县）不进索引
 *   - deprecated 不进索引（只索引现役）
 *   - 未知名 → null（落 unresolved）
 *   - snapshotYear 缺省取最新年；显式指定不存在的年 → 抛错
 *   - close() 释放连接
 * 不联网、不依赖 ~/.cndiv/cache.db。
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildCacheResolver } from '../dist/xzqh-resolver.js';

interface Row {
  code: string;
  name: string;
  level: number;
  parent_code: string | null;
  year: number;
  status?: string;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

/** 造一个最小 cache.db，返回其路径。 */
function makeDb(rows: Row[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'cndiv-resolver-'));
  dirs.push(dir);
  const dbPath = join(dir, 'cache.db');
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE divisions (
    code TEXT NOT NULL, name TEXT NOT NULL, level INTEGER NOT NULL,
    parent_code TEXT, year INTEGER NOT NULL, status TEXT,
    source_type TEXT, confidence_score REAL, urban_rural_code TEXT,
    PRIMARY KEY (code, year)
  )`);
  const ins = db.prepare(
    'INSERT INTO divisions (code,name,level,parent_code,year,status) VALUES (?,?,?,?,?,?)'
  );
  for (const r of rows) {
    ins.run(r.code, r.name, r.level, r.parent_code, r.year, r.status ?? 'active');
  }
  db.close();
  return dbPath;
}

const Y = 2023;
const baseRows: Row[] = [
  { code: '110000000000', name: '北京市', level: 1, parent_code: null, year: Y },
  { code: '110100000000', name: '市辖区', level: 2, parent_code: '110000000000', year: Y }, // 占位层
  { code: '110105000000', name: '朝阳区', level: 3, parent_code: '110100000000', year: Y },
  { code: '210000000000', name: '辽宁省', level: 1, parent_code: null, year: Y },
  { code: '211321000000', name: '朝阳区', level: 3, parent_code: '211300000000', year: Y }, // 同名歧义
  { code: '650100000000', name: '乌鲁木齐市', level: 2, parent_code: '650000000000', year: Y },
  { code: '650199000000', name: '废弃县', level: 3, parent_code: '650100000000', year: Y, status: 'deprecated' },
];

describe('buildCacheResolver', () => {
  it('唯一名命中单码；未知名 → null', () => {
    const r = buildCacheResolver({ dbPath: makeDb(baseRows) });
    try {
      expect(r.resolve('北京市')).toBe('110000000000');
      expect(r.resolve('乌鲁木齐市')).toBe('650100000000');
      expect(r.resolve('不存在的县')).toBeNull();
    } finally {
      r.close();
    }
  });

  it('同名歧义 → null + 记入 ambiguous 全候选（绝不臆造）', () => {
    const r = buildCacheResolver({ dbPath: makeDb(baseRows) });
    try {
      expect(r.resolve('朝阳区')).toBeNull(); // 不猜
      expect(r.ambiguous.get('朝阳区')?.sort()).toEqual([
        '110105000000',
        '211321000000',
      ]);
    } finally {
      r.close();
    }
  });

  it('占位层（市辖区/县）与 deprecated 不进索引', () => {
    const r = buildCacheResolver({ dbPath: makeDb(baseRows) });
    try {
      expect(r.resolve('市辖区')).toBeNull(); // 占位层排除
      expect(r.resolve('废弃县')).toBeNull(); // deprecated 排除
    } finally {
      r.close();
    }
  });

  it('snapshotYear 缺省取最新年', () => {
    const rows: Row[] = [
      { code: '110000000000', name: '北京市', level: 1, parent_code: null, year: 2022 },
      { code: '110000000000', name: '北京市', level: 1, parent_code: null, year: 2023 },
      { code: '440000000000', name: '广东省', level: 1, parent_code: null, year: 2023 }, // 仅 2023 有
    ];
    const r = buildCacheResolver({ dbPath: makeDb(rows) });
    try {
      expect(r.snapshotYear).toBe(2023);
      expect(r.resolve('广东省')).toBe('440000000000');
    } finally {
      r.close();
    }
  });

  it('显式指定不存在的快照年 → 抛错（不静默降级）', () => {
    const dbPath = makeDb(baseRows);
    expect(() => buildCacheResolver({ dbPath, snapshotYear: 1999 })).toThrow(
      /不在 cache\.db/
    );
  });
});
