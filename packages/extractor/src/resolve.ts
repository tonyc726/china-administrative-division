/**
 * intents → Patch 操作：用注入的 CodeResolver 把名称解析为 12 位码。
 * 解析不到（新设实体无码 / 名称未命中）一律落 unresolved，绝不臆造码。
 */
import type { Operation } from '@cndiv/data-protocol';
import type { ChangeIntent, CodeResolver, ResolveResult } from './types.js';

export function intentsToPatch(intents: ChangeIntent[], resolve: CodeResolver): ResolveResult {
  const operations: Operation[] = [];
  const unresolved: ResolveResult['unresolved'] = [];

  for (const intent of intents) {
    switch (intent.kind) {
      case 'rename': {
        const code = resolve(intent.from);
        if (!code) {
          unresolved.push({ intent, reason: `未在基线找到「${intent.from}」` });
          break;
        }
        operations.push({ op: 'update', code, name: intent.to });
        break;
      }
      case 'abolish': {
        const code = resolve(intent.target);
        if (!code) {
          unresolved.push({ intent, reason: `未在基线找到「${intent.target}」` });
          break;
        }
        operations.push({ op: 'remove', code, reason: intent.evidence });
        break;
      }
      case 'transfer': {
        const code = resolve(intent.target);
        const parent = resolve(intent.newParent);
        if (!code || !parent) {
          unresolved.push({
            intent,
            reason: `未解析「${!code ? intent.target : intent.newParent}」`,
          });
          break;
        }
        operations.push({ op: 'move', code, new_parent: parent });
        break;
      }
      case 'establish': {
        // 新设实体无既有码，无法自动产出合法 add（需上级分配码后人工补）
        unresolved.push({ intent, reason: `新设「${intent.name}」需人工分配区划码后补 add` });
        break;
      }
    }
  }

  return { operations, unresolved };
}
