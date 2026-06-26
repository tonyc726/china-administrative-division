/**
 * Build a @cndiv/source-<year> data package CSV from an NBS five-level SQLite.
 *
 * 把 NBS.<year>.sqlite（province/city/area/street/village 五表）转换为统一的
 * divisions CSV（12 位定长码 + level 1-5 + parent_code），供 cndiv hydrate 注水。
 *
 * Usage:
 *   tsx src/scripts/build-source.ts --input=NBS.2023.sqlite --year=2023 \
 *     --output=../source-2023/data/divisions.csv
 */
import Database from 'better-sqlite3';
import { mkdirSync, createWriteStream, writeFileSync } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { DIVISIONS_CSV_HEADER, csvCell } from '@cndiv/data-protocol';

interface BaseRow {
  code: string;
  name: string;
}
interface CityRow extends BaseRow {
  provinceCode: string | null;
}
interface AreaRow extends BaseRow {
  cityCode: string | null;
}
interface StreetRow extends BaseRow {
  areaCode: string | null;
}
interface VillageRow extends BaseRow {
  streetCode: string | null;
}

/** NBS 码为 6/9/12 位混合，统一右补零到 12 位定长 */
function pad12(code: string | null | undefined): string | null {
  return code ? code.padEnd(12, '0') : null;
}

function parseArgs(argv: string[]): { input?: string; year?: string; output: string } {
  const get = (key: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];
  return {
    input: get('input'),
    year: get('year'),
    output: get('output') ?? './data/divisions.csv',
  };
}

function main(): void {
  const { input, year, output } = parseArgs(process.argv.slice(2));

  if (!input || !year) {
    console.error('Usage: build-source --input=<NBS.YYYY.sqlite> --year=<YYYY> [--output=<csv>]');
    process.exit(1);
  }

  const db = new Database(input, { readonly: true });

  mkdirSync(path.dirname(output), { recursive: true });
  const ws = createWriteStream(output);

  // 边写边算 SHA-512 与字节数，产出确定性 manifest（无时间戳→同输入字节一致，保持 M0 可复现）
  const hash = crypto.createHash('sha512');
  let bytes = 0;
  const writeLine = (s: string): void => {
    ws.write(s);
    hash.update(s);
    bytes += Buffer.byteLength(s);
  };

  writeLine(`${DIVISIONS_CSV_HEADER}\n`);

  let total = 0;
  let skipped = 0;
  let maxLevel = 0;
  const emit = <T extends BaseRow>(rows: T[], level: number, parentOf: (row: T) => string | null): void => {
    for (const row of rows) {
      const code = pad12(row.code);
      if (!code) continue;
      const parent = parentOf(row);
      // 跳过 NBS 自指占位行：直筒子市(东莞/中山/儋州)、特殊单位(金门县)等，
      // NBS 在缺失层级用"自己指向自己"补位，会与真实实体碰撞且 parent 自指，丢弃之。
      // 丢弃后下级(街道/村)的 parent 仍能解析到真实上级(如东莞市 level2)，层级完整。
      if (parent === code) {
        skipped++;
        continue;
      }
      writeLine(`${code},${csvCell(row.name)},${level},${parent ?? ''},${year},active,official_nbs,100\n`);
      total++;
      if (level > maxLevel) maxLevel = level;
    }
  };

  emit(db.prepare('SELECT code, name FROM province').all() as BaseRow[], 1, () => null);
  emit(db.prepare('SELECT code, name, provinceCode FROM city').all() as CityRow[], 2, (r) => pad12(r.provinceCode));
  emit(db.prepare('SELECT code, name, cityCode FROM area').all() as AreaRow[], 3, (r) => pad12(r.cityCode));
  emit(db.prepare('SELECT code, name, areaCode FROM street').all() as StreetRow[], 4, (r) => pad12(r.areaCode));
  emit(db.prepare('SELECT code, name, streetCode FROM village').all() as VillageRow[], 5, (r) => pad12(r.streetCode));

  ws.end(() => {
    // manifest.json 与 CSV 同目录、随 files:["data"] 一起发布，供 hydrate 离线注水做完整性校验
    const manifest = {
      year: Number(year),
      source: 'NBS',
      format: 'csv',
      file: path.basename(output),
      rows: total,
      levels: maxLevel,
      bytes,
      sha512: hash.digest('hex'),
      placeholders_skipped: skipped,
      generator: '@cndiv/cli build-source',
    };
    const manifestPath = path.join(path.dirname(output), 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `Wrote ${total} divisions for ${year} → ${output} ` +
        `(${skipped} self-referential placeholders skipped)\n` +
        `Wrote manifest.json → sha512 ${manifest.sha512.slice(0, 16)}… (${bytes} bytes)`,
    );
  });
  db.close();
}

main();
