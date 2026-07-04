/**
 * merge-patches CLI 单测 + e2e。
 *
 * 覆盖正确性关键路径：
 *   - classifyPipeline 纯函数：文件名/author 启发式回退（xzqh/dmfw/community）
 *   - e2e：源目录多份 patch → 合并成品 + 冲突 sidecar；meta.source_pipeline 戳优先于文件名
 * 不联网。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { classifyPipeline, mergePatchesCommand } from '../dist/merge-patches.js';

describe('classifyPipeline 启发式回退', () => {
  it('文件名含 xzqh → xzqh', () => {
    expect(classifyPipeline('xzqh-2026.json')).toBe('xzqh');
  });
  it('文件名含 dmfw → dmfw', () => {
    expect(classifyPipeline('110000000000-dmfw-2026.json')).toBe('dmfw');
  });
  it('author 含 dmfw-crawler → dmfw', () => {
    expect(classifyPipeline('patch.json', 'dmfw-crawler')).toBe('dmfw');
  });
  it('都不含 → community', () => {
    expect(classifyPipeline('310115-pudong.json', 'alice')).toBe('community');
  });
});

describe('merge-patches e2e', () => {
  let tmp: string;
  let dir: string;
  let out: string;
  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'cndiv-merge-e2e-'));
    dir = path.join(tmp, 'raw');
    out = path.join(tmp, 'merged.json');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const write = (name: string, obj: unknown) =>
    writeFileSync(path.join(dir, name), JSON.stringify(obj));

  it('同 code 冲突 → 高优先级胜、败者落 sidecar', async () => {
    write('xzqh-2026.json', {
      meta: { author: 'xzqh-crawler', apply_after: '2023-baseline', source_pipeline: 'xzqh' },
      operations: [{ op: 'update', code: '110105000000', name: 'xzqh版' }],
    });
    write('110000-dmfw-2026.json', {
      meta: { author: 'dmfw-crawler', apply_after: '2023-baseline', source_pipeline: 'dmfw' },
      operations: [{ op: 'update', code: '110105000000', name: 'dmfw版' }],
    });
    await mergePatchesCommand({ dir, out });

    const merged = JSON.parse(readFileSync(out, 'utf-8'));
    expect(merged.operations).toHaveLength(1);
    expect(merged.operations[0].name).toBe('xzqh版');

    const sidecar = out.replace(/\.json$/, '.conflicts.json');
    expect(existsSync(sidecar)).toBe(true);
    const conflicts = JSON.parse(readFileSync(sidecar, 'utf-8'));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].losingPipeline).toBe('dmfw');
  });

  it('meta.source_pipeline 戳优先于误导文件名', async () => {
    // 文件名带 'dmfw' 但盖 community 戳 → 应按 community（> dmfw）胜
    write('aaa-dmfw-lookalike.json', {
      meta: { author: 'x', apply_after: '2023-baseline', source_pipeline: 'community' },
      operations: [{ op: 'update', code: '110105000000', name: '社区版' }],
    });
    write('bbb-dmfw.json', {
      meta: { author: 'dmfw-crawler', apply_after: '2023-baseline', source_pipeline: 'dmfw' },
      operations: [{ op: 'update', code: '110105000000', name: 'dmfw版' }],
    });
    await mergePatchesCommand({ dir, out });
    const merged = JSON.parse(readFileSync(out, 'utf-8'));
    expect(merged.operations[0].name).toBe('社区版');
  });
});
