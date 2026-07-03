/**
 * xzqh 抓取器的离线契约测试（不联网，全部基于 test/fixtures 下的真实 GB18030 字节样本）。
 *
 * 承重假设：
 *   1) 全站 GBK/GB18030 编码——iconv 解码后中文必须无乱码（岑岭县/草湖市）。
 *   2) dcpid ↔ 年份映射从索引页 <a href> 动态解析（1999–至今），非硬编码列表。
 *   3) .tz_con 缺失/为空（如 2022 冻结期）→ 空结果而非抛错。
 *   4) 变更文本经 extractPatch 后：可解析名称成合法 Operation（过 validatePatch），
 *      新设实体无码则明确落 unresolved。
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { parseYearLinks, parseChanges } from '../dist/xzqh.js';
import { extractPatch, type CodeResolver } from '@cndiv/extractor';
import { validatePatch } from '@cndiv/data-protocol';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const readGbk = (name: string): string =>
  iconv.decode(readFileSync(path.join(FIX, name)), 'gb18030');

describe('GBK/GB18030 解码', () => {
  it('原始字节非 UTF-8，解码后中文无乱码', () => {
    const raw = readFileSync(path.join(FIX, 'xzqh-2026.gbk.html'));
    // 原始字节里不含「岑」的 UTF-8 编码，含其 GB18030 编码 → 证明确为 GBK 源
    expect(raw.includes(Buffer.from('岑', 'utf-8'))).toBe(false);
    expect(raw.includes(iconv.encode('岑', 'gb18030'))).toBe(true);

    const html = iconv.decode(raw, 'gb18030');
    expect(html).toContain('县级以上行政区划变更情况');
    expect(html).toContain('岑岭县');
    expect(html).not.toContain('�'); // 无替换字符（乱码标志）
  });
});

describe('parseYearLinks（dcpid↔年份动态映射）', () => {
  const links = parseYearLinks(readGbk('xzqh-index.gbk.html'), 'http://xzqh.mca.gov.cn/description?dcpid=1');

  it('解析出连续年份且 dcpid 等于年份', () => {
    const years = links.map((l) => l.year);
    expect(years).toContain(1999);
    expect(years).toContain(2026);
    for (const l of links) expect(l.dcpid).toBe(l.year);
  });

  it('抽查 2024/2025/2026 链接可用', () => {
    for (const y of [2024, 2025, 2026]) {
      const l = links.find((x) => x.year === y);
      expect(l).toBeDefined();
      expect(l?.url).toBe(`http://xzqh.mca.gov.cn/description?dcpid=${y}`);
    }
  });

  it('2022（冻结期）不在索引中', () => {
    expect(links.find((l) => l.year === 2022)).toBeUndefined();
  });
});

describe('parseChanges', () => {
  it('2026 年解析出「设立岑岭县」「设立县级草湖市」含机关/日期', () => {
    const entries = parseChanges(readGbk('xzqh-2026.gbk.html'));
    expect(entries.length).toBe(2);

    const cen = entries.find((e) => e.text.includes('岑岭县'));
    expect(cen).toBeDefined();
    expect(cen?.text).toContain('设立岑岭县');
    expect(cen?.date).toBe('2026-03-26');
    expect(cen?.org).toBe('新疆维吾尔自治区人民政府');

    const cao = entries.find((e) => e.text.includes('草湖市'));
    expect(cao).toBeDefined();
    expect(cao?.text).toContain('设立县级草湖市');
    expect(cao?.date).toBe('2026-04-17');
  });

  it('2022（无 .tz_con 内容）返回空数组，不抛错', () => {
    expect(parseChanges(readGbk('xzqh-2022.gbk.html'))).toEqual([]);
  });
});

describe('extractPatch 集成', () => {
  it('新设实体（设立岑岭县）无既有码 → 明确落 unresolved', async () => {
    const [entry] = parseChanges(readGbk('xzqh-2026.gbk.html'));
    const nullResolver: CodeResolver = () => null;
    const { operations, unresolved } = await extractPatch(entry.text, {
      resolve: nullResolver,
    });
    expect(operations).toHaveLength(0);
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved[0].reason).toContain('人工');
  });

  it('可解析名称的撤销 → 合法 Operation 且过 validatePatch', async () => {
    // 用基线命中的撤销句，验证端到端能产出合法 remove op
    const resolver: CodeResolver = (name) =>
      name === '岑岭县' ? '650000000001' : null;
    const { operations, unresolved } = await extractPatch('撤销岑岭县', {
      resolve: resolver,
    });
    expect(unresolved).toHaveLength(0);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ op: 'remove', code: '650000000001' });

    const result = validatePatch({
      meta: { author: 'test' },
      operations,
    });
    expect(result.success).toBe(true);
  });
});
