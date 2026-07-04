/**
 * rebuild-nbs-sqlite.ts — 从 NBS 嵌套年度 JSON 忠实重建单年 NBS.<year>.sqlite
 *
 * 背景：NBS.2015.sqlite 冷母本 0 字节损坏，原始 data/stats.gov.cn/2015.json 幸存。
 * 本脚本按【现存兄弟库 NBS.2023.sqlite 的确切 schema】重建，保证与其它年份一致：
 *   province(code2, name)
 *   city(code4, name, provinceCode)
 *   area(code6, name, cityCode, provinceCode)
 *   street(code9, name, areaCode, provinceCode, cityCode)
 *   village(code12, name, streetCode, provinceCode, cityCode, areaCode)   ← 无 categoryCode 列（兄弟库亦无）
 *
 * 忠实原则：只做码剥位与父子挂接，不臆造任何名称"修复"。计数如实反映幸存 JSON。
 *
 * 用法：bun scripts/rebuild-nbs-sqlite.ts <input.json> <output.sqlite>
 * 依赖：Bun 内置 bun:sqlite（零外部依赖）。
 */
import { Database } from 'bun:sqlite';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    '用法: bun scripts/rebuild-nbs-sqlite.ts <input.json> <output.sqlite>'
  );
  process.exit(1);
}

interface Village {
  name: string;
  code: string;
}
interface Town {
  name: string;
  code: string;
  villages?: Village[];
}
interface County {
  name: string;
  code: string;
  towns?: Town[];
}
interface City {
  name: string;
  code: string;
  counties?: County[];
}
interface Province {
  name: string;
  code: string;
  cities?: City[];
}

const data = (await Bun.file(input).json()) as Province[];

const db = new Database(output, { create: true });
db.exec('PRAGMA journal_mode = WAL');

// 与 NBS.2023.sqlite .schema 逐字一致（含外键约束与列顺序）
db.exec(`
CREATE TABLE \`province\` (\`code\` VARCHAR(255) PRIMARY KEY, \`name\` VARCHAR(255));
CREATE TABLE \`city\` (\`code\` VARCHAR(255) PRIMARY KEY, \`name\` VARCHAR(255), \`provinceCode\` VARCHAR(255) REFERENCES \`province\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE);
CREATE TABLE \`area\` (\`code\` VARCHAR(255) PRIMARY KEY, \`name\` VARCHAR(255), \`cityCode\` VARCHAR(255) REFERENCES \`city\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE, \`provinceCode\` VARCHAR(255) REFERENCES \`province\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE);
CREATE TABLE \`street\` (\`code\` VARCHAR(255) PRIMARY KEY, \`name\` VARCHAR(255), \`areaCode\` VARCHAR(255) REFERENCES \`area\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE, \`provinceCode\` VARCHAR(255) REFERENCES \`province\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE, \`cityCode\` VARCHAR(255) REFERENCES \`city\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE);
CREATE TABLE \`village\` (\`code\` VARCHAR(255) PRIMARY KEY, \`name\` VARCHAR(255), \`streetCode\` VARCHAR(255) REFERENCES \`street\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE, \`provinceCode\` VARCHAR(255) REFERENCES \`province\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE, \`cityCode\` VARCHAR(255) REFERENCES \`city\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE, \`areaCode\` VARCHAR(255) REFERENCES \`area\` (\`code\`) ON DELETE SET NULL ON UPDATE CASCADE);
`);

// INSERT OR IGNORE == Sequelize ignoreDuplicates
const insP = db.query(
  'INSERT OR IGNORE INTO province (code,name) VALUES (?,?)'
);
const insC = db.query(
  'INSERT OR IGNORE INTO city (code,name,provinceCode) VALUES (?,?,?)'
);
const insA = db.query(
  'INSERT OR IGNORE INTO area (code,name,cityCode,provinceCode) VALUES (?,?,?,?)'
);
const insS = db.query(
  'INSERT OR IGNORE INTO street (code,name,areaCode,provinceCode,cityCode) VALUES (?,?,?,?,?)'
);
const insV = db.query(
  'INSERT OR IGNORE INTO village (code,name,streetCode,provinceCode,cityCode,areaCode) VALUES (?,?,?,?,?,?)'
);

const n = { p: 0, c: 0, a: 0, s: 0, v: 0 };
const build = db.transaction(() => {
  for (const P of data) {
    const pc = P.code.slice(0, 2);
    insP.run(pc, P.name);
    n.p++;
    for (const C of P.cities ?? []) {
      const cc = C.code.slice(0, 4);
      insC.run(cc, C.name, pc);
      n.c++;
      for (const A of C.counties ?? []) {
        const ac = A.code.slice(0, 6);
        insA.run(ac, A.name, cc, pc);
        n.a++;
        for (const S of A.towns ?? []) {
          const sc = S.code.slice(0, 9);
          insS.run(sc, S.name, ac, pc, cc);
          n.s++;
          for (const V of S.villages ?? []) {
            insV.run(V.code, V.name, sc, pc, cc, ac);
            n.v++;
          }
        }
      }
    }
  }
});
build();
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();

console.log(`✅ 写入 ${output}`);
console.log(`   遍历: 省=${n.p} 市=${n.c} 县=${n.a} 乡=${n.s} 村=${n.v}`);
