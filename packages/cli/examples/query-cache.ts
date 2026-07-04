/**
 * @cndiv/cli 示例：注水后如何查询 cache.db 里的行政区划数据。
 *
 * ⚠️ 仓库未提供封装查询 API——消费者用 better-sqlite3 + 原生 SQL 直查 divisions 表。
 *    本示例自建一个内存样本库（含直辖市「市辖区占位层」坑）演示正确查询范式；
 *    真实使用时把库路径换成 `cndiv hydrate --year=2023` 产生的 ~/.cndiv/cache.db
 *    （即把下面「建表 + 塞样本」两步换成 `new Database(dbPath, { readonly: true })`）。
 *
 * 运行：npx tsx packages/cli/examples/query-cache.ts
 */
import Database from 'better-sqlite3';
import { DATABASE_SCHEMA, INSERT_DIVISIONS_BATCH } from '@cndiv/data-protocol';
import { getLevelFromCode, getParentCode, type Division } from '@cndiv/core';

const YEAR = 2023;

// —— 准备：真实场景下这一步由 `cndiv hydrate --year=2023` 完成，直接打开 cache.db 即可 ——
const db = new Database(':memory:');
db.exec(DATABASE_SCHEMA); // 建 divisions/metadata/patch_history 三表（与 hydrate 同一权威 schema）
const ins = db.prepare(INSERT_DIVISIONS_BATCH); // 9 占位符，末位 urban_rural_code 传 null
const sample: Array<[string, string, number, string | null]> = [
  ['110000000000', '北京市', 1, null],
  ['110100000000', '市辖区', 2, '110000000000'], // ← 直辖市特有的占位中间层（坑）
  ['110101000000', '东城区', 3, '110100000000'],
  ['110102000000', '西城区', 3, '110100000000'],
  ['110101001000', '东华门街道', 4, '110101000000'],
];
for (const [code, name, level, parent] of sample) {
  ins.run(code, name, level, parent, YEAR, 'active', 'official_nbs', 100, null);
}

// 1) 按码查某年快照——务必带 year（主键是复合 (code, year)，漏 year 会跨年命中多行）
const dongcheng = db
  .prepare(
    'SELECT code,name,level,parent_code,year FROM divisions WHERE code=? AND year=?'
  )
  .get('110101000000', YEAR) as Division | undefined;
console.log('1) 按码查 110101000000 →', dongcheng?.name); // 东城区

// 2) 查直接子级——坑：直辖市省级的子级是「市辖区」占位层，要再下钻一层才到区
const ofBeijing = db
  .prepare(
    'SELECT name FROM divisions WHERE parent_code=? AND year=? ORDER BY code'
  )
  .all('110000000000', YEAR);
console.log('2) 北京(110000)直接子级 →', ofBeijing); // [{ name: '市辖区' }]
const ofShixiaqu = db
  .prepare(
    'SELECT name FROM divisions WHERE parent_code=? AND year=? ORDER BY code'
  )
  .all('110100000000', YEAR);
console.log('   市辖区(110100)下子级 →', ofShixiaqu); // [东城区, 西城区]

// 3) 递归 CTE 查全部后代（SQLite 原生支持，用具名参数避免重复绑定）
const descendants = db
  .prepare(
    `WITH RECURSIVE sub(code) AS (
       SELECT code FROM divisions WHERE code=@root AND year=@y
       UNION ALL
       SELECT d.code FROM divisions d JOIN sub ON d.parent_code = sub.code WHERE d.year=@y
     )
     SELECT d.code, d.name, d.level FROM divisions d JOIN sub ON d.code=sub.code
     WHERE d.year=@y ORDER BY d.code`
  )
  .all({ root: '110000000000', y: YEAR });
console.log('3) 北京全部后代 →', descendants.length, '条');

// 4) 配合 @cndiv/core 纯码工具构造查询参数（不碰 DB）
const lvl = getLevelFromCode('110101000000'); // 3 (COUNTY)
const parentCode = lvl !== null ? getParentCode('110101000000', lvl) : null; // '110100000000'
const parent = db
  .prepare('SELECT name FROM divisions WHERE code=? AND year=?')
  .get(parentCode, YEAR) as Pick<Division, 'name'> | undefined;
console.log('4) 东城区父码', parentCode, '→', parent?.name); // 市辖区

db.close();
