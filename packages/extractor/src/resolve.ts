/**
 * intents → Patch 操作：用注入的解析器把名称解析为 12 位码。
 *
 * 两个解析方向（缺一不可）：
 *   - **后向** `resolve`：在**基线年**快照里查被撤销/更名/划转的**既有**实体。
 *   - **前向** `resolveNew`：在**更晚的权威快照**（NBS 2023 / dmfw 实时）里查**新设**实体，
 *     取其官方码产出 add。没有前向解析器时，establish 一律落人工（旧行为）。
 *
 * 铁律：解析不到一律落 unresolved，绝不臆造码。前向解析是**查证**不是编造——
 * 码来自官方快照，不是我们拼出来的。
 */
import type { Operation } from '@cndiv/data-protocol';
import type {
  ChangeIntent,
  CodeResolver,
  NewCodeResolver,
  ResolveResult,
} from './types.js';

/**
 * 合并类变更的净额归零：
 *
 * 「撤销杭州市上城区、江干区，设立**新的**杭州市上城区」——上城区被撤又被设，
 * 解析后两侧是**同一个码** 330102。若照直发 `remove 330102` + `add 330102`，
 * 结果完全取决于应用顺序：顺序一反，上城区就从名册上凭空消失。
 *
 * 而对「县级以上区划名册」这个建模层次而言，它压根没变——变的是辖区边界（江干区并进来了），
 * 码和名都还在。名册视角下这是 no-op，故两条操作双双抵消、只留审计记录。
 * （真正消失的是江干区，它只有 abolish 没有对应 establish，remove 照常发出。）
 */
function neutralizeMerges(
  ops: Operation[],
  intents: ChangeIntent[]
): { kept: Operation[]; neutralized: Array<{ code: string; note: string }> } {
  const removed = new Map<string, Operation>();
  const added = new Map<string, Operation>();
  for (const op of ops) {
    if (op.op === 'remove') removed.set(op.code, op);
    if (op.op === 'add') added.set(op.code, op);
  }

  const collide = [...removed.keys()].filter((code) => added.has(code));
  if (collide.length === 0) return { kept: ops, neutralized: [] };

  const dropped = new Set<Operation>();
  const neutralized: Array<{ code: string; note: string }> = [];
  for (const code of collide) {
    dropped.add(removed.get(code)!);
    dropped.add(added.get(code)!);
    const evidence =
      intents.find((i) => i.kind === 'abolish' || i.kind === 'establish')
        ?.evidence ?? '';
    neutralized.push({
      code,
      note: `撤销+设立同码（合并存续，名册不变）：${evidence.slice(0, 60)}`,
    });
  }
  return { kept: ops.filter((op) => !dropped.has(op)), neutralized };
}

export interface IntentsToPatchOptions {
  /** 后向：基线年快照，解析既有实体 */
  resolve: CodeResolver;
  /** 前向：更晚的权威快照，解析新设实体；缺省则 establish 全落人工 */
  resolveNew?: NewCodeResolver;
}

export function intentsToPatch(
  intents: ChangeIntent[],
  options: CodeResolver | IntentsToPatchOptions
): ResolveResult {
  // 兼容旧签名 intentsToPatch(intents, resolve)
  const opts: IntentsToPatchOptions =
    typeof options === 'function' ? { resolve: options } : options;
  const { resolve: rawResolve, resolveNew: rawResolveNew } = opts;

  /**
   * 带文档上下文的解析：裸名先直接查；查不到（或歧义）再用标题里的省/市名限定重查。
   * 「江北区」→ 歧义（重庆/宁波）→ 「重庆市江北区」→ 唯一。
   * 上下文只用于**排除**候选，不参与拼码——一个码都不编。
   */
  const withContext = <T>(
    fn: (name: string) => T | null,
    name: string,
    context?: string
  ): T | null => {
    const direct = fn(name);
    if (direct || !context) return direct;
    return fn(`${context}${name}`);
  };

  const operations: Operation[] = [];
  const unresolved: ResolveResult['unresolved'] = [];

  for (const intent of intents) {
    const ctx = intent.context;
    const resolve = (name: string): string | null =>
      withContext(rawResolve, name, ctx);
    const resolveNew = rawResolveNew
      ? (name: string) => withContext(rawResolveNew, name, ctx)
      : undefined;

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
          unresolved.push({
            intent,
            reason: `未在基线找到「${intent.target}」`,
          });
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
        // 前向解析：新设实体在更晚的权威快照里查官方码（查证，非臆造）
        const ref = resolveNew?.(intent.name);
        if (!ref) {
          unresolved.push({
            intent,
            reason: resolveNew
              ? `新设「${intent.name}」在前向快照中未命中，需人工补 add`
              : `新设「${intent.name}」需人工分配区划码后补 add`,
          });
          break;
        }
        operations.push({
          op: 'add',
          code: ref.code,
          name: ref.name,
          level: ref.level,
          parent_code: ref.parent_code,
        } as Operation);
        break;
      }
    }
  }

  const { kept } = neutralizeMerges(operations, intents);
  return { operations: kept, unresolved };
}
