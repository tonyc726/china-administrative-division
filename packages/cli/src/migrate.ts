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
import { mkdir, writeFile } from 'fs/promises';
import crypto from 'crypto';
import { glob } from 'glob';
import path from 'path';
import {
  getLevelFromCode,
  getParentCode,
  normalizeCode,
  type Division,
} from '@cndiv/core';
import {
  DATABASE_SCHEMA,
  INSERT_DIVISIONS_BATCH,
  DIVISIONS_CSV_HEADER,
  csvCell,
} from '@cndiv/data-protocol';

export interface MigrateOptions {
  /** 输入目录（含 *.json.gz / *.json），默认 ./legacy/data/GB2260 */
  input: string;
  /** 输出 SQLite 路径，默认 ./dist/source-history.db */
  output: string;
  /** 可选：同时把多年份结果固化为数据包 CSV（含逐行 year）+ 同目录 manifest.json */
  csv?: string;
}

export interface MigrateResult {
  files: number;
  records: number;
  skipped: number;
  years: number[];
  /** 若 --csv，固化出的 CSV 路径 + 行数 + SHA-512 */
  csvPath?: string;
  csvRows?: number;
  csvSha512?: string;
}

/**
 * 把 migrate 产出的多年份 SQLite 固化为确定性数据包 CSV（按 code,year 稳定排序）+ manifest。
 * 与 build-source 同格式（逐行带 year），但跨 1980–2021 全部分区，供 @cndiv/source-history 分发。
 */
async function exportDbToDataPackage(
  db: Database.Database,
  csvPath: string,
): Promise<{ rows: number; sha512: string; years: number[] }> {
  const rows = db
    .prepare(
      `SELECT code, name, level, parent_code, year, status, source_type, confidence_score
       FROM divisions ORDER BY code ASC, year ASC`,
    )
    .all() as Array<{
    code: string;
    name: string;
    level: number;
    parent_code: string | null;
    year: number;
    status: string;
    source_type: string | null;
    confidence_score: number | null;
  }>;

  const hash = crypto.createHash('sha512');
  let bytes = 0;
  const yearSet = new Set<number>();
  const write = (s: string): void => {
    hash.update(s);
    bytes += Buffer.byteLength(s);
  };

  let csv = '';
  write((csv = `${DIVISIONS_CSV_HEADER}\n`));
  const parts: string[] = [csv];
  for (const r of rows) {
    yearSet.add(r.year);
    const line = `${r.code},${csvCell(r.name)},${r.level},${r.parent_code ?? ''},${r.year},${r.status},${r.source_type ?? ''},${r.confidence_score ?? 100}\n`;
    write(line);
    parts.push(line);
  }

  const years = [...yearSet].sort((a, b) => a - b);
  const sha512 = hash.digest('hex');

  await mkdir(path.dirname(csvPath), { recursive: true });
  await writeFile(csvPath, parts.join(''));

  const manifest = {
    source: 'GB2260',
    format: 'csv',
    file: path.basename(csvPath),
    rows: rows.length,
    levels: rows.reduce((m, r) => Math.max(m, r.level), 0),
    years: years.length,
    year_min: years[0],
    year_max: years[years.length - 1],
    bytes,
    sha512,
    generator: '@cndiv/cli migrate --csv',
  };
  await writeFile(path.join(path.dirname(csvPath), 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { rows: rows.length, sha512, years };
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
      // 单行化：折叠内嵌换行/连续空白为单空格（GB2260 个别年份如 2021 的 name 含变更流水换行，
      // 不清洗会让 CSV 字段内嵌 \n、物理行虚高并成为下游解析陷阱）
      name: typeof item.name === 'string' ? item.name.replace(/\s+/g, ' ').trim() : '',
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

  // 可选：把多年份结果固化为数据包 CSV + manifest（@cndiv/source-history）
  let csvPath: string | undefined;
  let csvRows: number | undefined;
  let csvSha512: string | undefined;
  if (options.csv) {
    const out = await exportDbToDataPackage(db, options.csv);
    csvPath = options.csv;
    csvRows = out.rows;
    csvSha512 = out.sha512;
    console.log(`  固化数据包: ${out.rows} 条 / ${out.years.length} 年 → ${options.csv} (+manifest, sha512 ${out.sha512.slice(0, 16)}…)`);
  }

  db.close();
  return { files: files.length, records, skipped, years: years.sort(), csvPath, csvRows, csvSha512 };
}
