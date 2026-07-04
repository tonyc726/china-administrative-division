/**
 * export-nbs-json.ts — 由 NBS.<year>.sqlite 反导出嵌套树 JSON（溯源/round-trip 留档）
 *
 * 背景：NBS.2022/2023 无原始年度 JSON（stats.gov.cn 采集止于 2021）。本脚本从 sqlite
 * 反向重建与 data/stats.gov.cn/<year>.json 同构的嵌套树，补齐 12 位码，用于：
 *   ① 闭合 sqlite ↔ JSON 往返一致性；② 给 2022/2023 一份可复现的结构留档。
 *
 * ⚠️ 派生声明：产物由 sqlite 反导出，**非独立源采集**；且 sqlite 无城乡分类码，
 *    故 village 无 categoryCode 字段（与 2009–2021 原始 JSON 的内联 categoryCode 不同）。
 *
 * 用法：bun scripts/export-nbs-json.ts <input.sqlite> <output.json>
 */
import { Database } from 'bun:sqlite';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('用法: bun scripts/export-nbs-json.ts <input.sqlite> <output.json>');
  process.exit(1);
}

const db = new Database(input, { readonly: true });
const pad = (code: string) => code.padEnd(12, '0'); // 剥位码补回 12 位

type Row = { code: string; name: string; parent: string };
const bucket = (rows: Row[]) => {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.parent ?? '';
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  return m;
};

const provinces = db.query('SELECT code,name FROM province ORDER BY code').all() as { code: string; name: string }[];
const cities = bucket(db.query('SELECT code,name,provinceCode AS parent FROM city').all() as Row[]);
const areas = bucket(db.query('SELECT code,name,cityCode AS parent FROM area').all() as Row[]);
const streets = bucket(db.query('SELECT code,name,areaCode AS parent FROM street').all() as Row[]);
const villages = bucket(db.query('SELECT code,name,streetCode AS parent FROM village').all() as Row[]);
db.close();

const tree = provinces.map((P) => ({
  name: P.name,
  code: pad(P.code),
  cities: (cities.get(P.code) ?? []).map((C) => ({
    name: C.name,
    code: pad(C.code),
    counties: (areas.get(C.code) ?? []).map((A) => ({
      name: A.name,
      code: pad(A.code),
      towns: (streets.get(A.code) ?? []).map((S) => ({
        name: S.name,
        code: pad(S.code),
        villages: (villages.get(S.code) ?? []).map((V) => ({
          name: V.name,
          code: pad(V.code),
        })),
      })),
    })),
  })),
}));

await Bun.write(output, JSON.stringify(tree, null, 2));
const n = { p: provinces.length, v: [...villages.values()].reduce((s, a) => s + a.length, 0) };
console.log(`✅ 派生导出 ${output} — 省=${n.p} 村=${n.v}（sqlite 反导出，无 categoryCode）`);
