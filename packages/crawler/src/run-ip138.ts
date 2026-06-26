#!/usr/bin/env node
/**
 * 抓取 ip138 邮编/区号 → 校验 → 产出 @cndiv/source-postal 数据包（CSV + manifest）。
 *
 * 用法：
 *   tsx src/run-ip138.ts [--out=packages/source-postal/data] [--delay=150]
 *
 * 与 build-source 一致的确定性 manifest（SHA-512，无时间戳），便于完整性校验。
 */
import { writeFile, mkdir } from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fetchAllPostal } from './ip138.js';
import { validatePostalRecord, type PostalRecord } from '@cndiv/data-protocol';

const args = process.argv.slice(2);
const get = (key: string): string | undefined => args.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];

const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

async function main(): Promise<void> {
  const outDir = get('out') ?? 'packages/source-postal/data';
  const delayMs = Number(get('delay') ?? 150);

  console.log('抓取 ip138 邮编/区号（大陆各省，顺序限速）...');
  const records = await fetchAllPostal({
    delayMs,
    onProvince: (name, count) => console.log(`  ${name}: ${count} 条`),
  });

  // 写盘前逐条 schema 校验，剔除非法（6 位邮编 / 0 开头区号），不静默放行
  const valid: PostalRecord[] = [];
  let rejected = 0;
  for (const r of records) {
    if (validatePostalRecord(r).success) valid.push(r);
    else rejected++;
  }
  console.log(`\n抓取 ${records.length} 条，合法 ${valid.length} 条${rejected ? `，剔除 ${rejected} 条非法` : ''}`);

  if (valid.length === 0) {
    console.error('⛔ 零合法记录，疑似 ip138 结构再次变更，已中止写盘（不产出空数据包）');
    process.exit(1);
  }

  // 稳定排序（province, name）→ 确定性 CSV / manifest
  valid.sort((a, b) => a.province.localeCompare(b.province) || a.name.localeCompare(b.name));

  let csv = 'province,name,zip_code,area_code\n';
  for (const r of valid) {
    csv += `${csvCell(r.province)},${csvCell(r.name)},${r.zip_code},${r.area_code}\n`;
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'postal.csv'), csv);

  const manifest = {
    source: 'ip138',
    format: 'csv',
    file: 'postal.csv',
    rows: valid.length,
    bytes: Buffer.byteLength(csv),
    sha512: crypto.createHash('sha512').update(csv).digest('hex'),
    generator: '@cndiv/crawler run-ip138',
  };
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`写出 ${valid.length} 条 → ${outDir}/postal.csv + manifest.json (sha512 ${manifest.sha512.slice(0, 16)}…)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
