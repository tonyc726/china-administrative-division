/**
 * 统一 Legacy 数据迁移（替代原先互斥的两套实现：cli.ts 内联版 + scripts/migrate-legacy.ts）。
 *
 * 把 legacy GB2260 历史快照（`<year>.json.gz`，6 位扁平数组 [{code,name}]）迁入一个按
 * (code, year) 复合主键版本化的 SQLite，从而**保留 1980-2021 全部 40+ 年历史**。
 *
 * 单一真相源原则：
 *  - 区划码 level/parent 推导复用 @cndiv/core（正确的 2+2+2+3+3 切分），不再各自手写；
 *    旧 migrate-legacy 自带的切分把 88.7% 县级码误判为市级，本实现修复之。
 *  - 表结构复用 @cndiv/data-protocol 的 DATABASE_SCHEMA（PRIMARY KEY(code,year)），
 *    不再用旧版的 `code PRIMARY KEY` 把多年历史压成单年快照。
 */
import Database from 'better-sqlite3';
import { createGunzip } from 'zlib';
import { createReadStream } from 'fs';
import { mkdir } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import {
  getLevelFromCode,
  getParentCode,
  normalizeCode,
  type Division,
} from '@cndiv/core';
import { DATABASE_SCHEMA, INSERT_DIVISIONS_BATCH } from '@cndiv/data-protocol';

export interface MigrateOptions {
  /** 输入目录（含 *.json.gz / *.json），默认 ./legacy/data/GB2260 */
  input: string;
  /** 输出 SQLite 路径，默认 ./dist/source-history.db */
  output: string;
}

export interface MigrateResult {
  files: number;
  records: number;
  skipped: number;
  years: number[];
}

/** 从扁平数组 [{code,name}] 构造 Division 行；复用 core 推导 level/parent，无效码计入 skipped */
function rowsFromFlatArray(
  items: Array<{ code?: unknown; name?: unknown }>,
  year: number,
  onSkip: () => void,
): Division[] {
  const rows: Division[] = [];
  for (const item of items) {
    if (typeof item.code !== 'string') {
      onSkip();
      continue;
    }
    const code = normalizeCode(item.code);
    if (!code) {
      onSkip();
      continue;
    }
    const level = getLevelFromCode(code);
    if (level === null) {
      onSkip();
      continue;
    }
    rows.push({
      code,
      name: typeof item.name === 'string' ? item.name.trim() : '',
      level,
      parent_code: getParentCode(code, level),
      year,
      status: 'active',
      source_type: 'official_nbs',
      confidence_score: 100,
    });
  }
  return rows;
}

/** 流式解压 .json.gz / 读取 .json，返回解析后的 JSON */
async function readJsonMaybeGzip(filePath: string): Promise<unknown> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    const sink = filePath.endsWith('.gz') ? stream.pipe(createGunzip()) : stream;
    sink.on('data', (c: Buffer) => chunks.push(c));
    sink.on('end', () => resolve());
    sink.on('error', reject);
  });
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

/** 从文件名提取年份，如 2021.json.gz → 2021 */
function yearFromFilename(filePath: string): number | null {
  const m = path.basename(filePath).match(/(\d{4})\.json(\.gz)?$/);
  return m ? parseInt(m[1], 10) : null;
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const { input, output } = options;

  await mkdir(path.dirname(output), { recursive: true });
  const db = new Database(output);
  db.pragma('journal_mode = WAL');
  db.exec(DATABASE_SCHEMA);

  const files = (
    await Promise.all([glob(`${input}/*.json.gz`), glob(`${input}/*.json`)])
  )
    .flat()
    .sort();

  const insert = db.prepare(INSERT_DIVISIONS_BATCH);
  const insertMany = db.transaction((rows: Division[]) => {
    for (const r of rows) {
      insert.run(
        r.code,
        r.name,
        r.level,
        r.parent_code,
        r.year,
        r.status ?? 'active',
        r.source_type ?? null,
        r.confidence_score ?? null,
        r.urban_rural_code ?? null,
      );
    }
  });

  let records = 0;
  let skipped = 0;
  const years: number[] = [];

  for (const file of files) {
    const year = yearFromFilename(file);
    if (year === null) {
      console.warn(`跳过无法解析年份的文件: ${path.basename(file)}`);
      continue;
    }
    const data = await readJsonMaybeGzip(file);
    if (!Array.isArray(data)) {
      // 树形/嵌套 NBS 数据请走 build-source（NBS.sqlite→CSV），migrate 仅处理 GB2260 扁平历史。
      console.warn(
        `跳过非扁平数组格式: ${path.basename(file)}（树形 NBS 数据请用 build-source 处理）`,
      );
      continue;
    }
    const rows = rowsFromFlatArray(data, year, () => {
      skipped++;
    });
    insertMany(rows);
    records += rows.length;
    years.push(year);
    console.log(`  ${path.basename(file)} → ${rows.length} 条 (year=${year})`);
  }

  db.close();
  return { files: files.length, records, skipped, years: years.sort() };
}
