#!/usr/bin/env node
/**
 * 校验 patches/ 下所有 patch JSON 是否符合协议（供 CI 与本地使用）。
 *
 * 依赖已构建的 @cndiv/data-protocol：
 *   pnpm --filter @cndiv/data-protocol build
 * 运行：
 *   node scripts/validate-patches.mjs
 *
 * 注：直接引用构建产物（相对脚本文件解析），避免 workspace 包未提升到根 node_modules 的问题。
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { validatePatch } from '../packages/data-protocol/dist/index.js';

const PATCHES_DIR = 'patches';
let hasErrors = false;
let count = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.endsWith('.json')) continue;

    count++;
    let data;
    try {
      data = JSON.parse(readFileSync(full, 'utf-8'));
    } catch {
      console.error(`✗ 非法 JSON: ${full}`);
      hasErrors = true;
      continue;
    }

    const result = validatePatch(data);
    if (result.success) {
      console.log(`✓ ${full}`);
    } else {
      console.error(`✗ 校验失败: ${full}`);
      console.error(result.error);
      hasErrors = true;
    }
  }
}

if (!existsSync(PATCHES_DIR)) {
  console.log('未发现 patches/ 目录，跳过。');
  process.exit(0);
}

walk(PATCHES_DIR);
console.log(`\n共校验 ${count} 个 patch 文件。`);
if (hasErrors) {
  console.error('存在校验失败项 ❌');
  process.exit(1);
}
console.log('全部通过 ✅');
