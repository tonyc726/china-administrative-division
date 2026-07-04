/**
 * 锁定 @cndiv/cli 的库表面：只暴露可编程接口，import 时零副作用（不触发 CLI main）。
 * 若 index.ts 再次 re-export cli.js，import 本身会执行 CLI 参数解析——此测试能即时捕获回归。
 */
import { describe, it, expect } from 'vitest';
import * as lib from '../dist/index.js';

describe('@cndiv/cli 库 API', () => {
  it('导出 hydrate/export/apply-patch/migrate 且不含 CLI 运行器', () => {
    expect(typeof lib.hydrate).toBe('function');
    expect(typeof lib.exportFromCache).toBe('function');
    expect(typeof lib.applyPatch).toBe('function');
    expect(typeof lib.migrate).toBe('function');
    // CLI 运行器不应出现在库表面
    expect('main' in lib).toBe(false);
  });
});
