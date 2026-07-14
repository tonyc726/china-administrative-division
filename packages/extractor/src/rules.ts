/**
 * 规则法意图抽取：高精度命中民政部《县级以上行政区划变更情况》的公告句式。
 *
 * 设计取向：宁可漏（交 LLM/人工），不可错——错一条就是往库里写一个假的撤销。
 *
 * ## 名称边界靠「动词墙」，不靠贪婪度（2026-07 重写的核心）
 *
 * 旧实现用非贪婪 `[一-龥]{2,15}?(?:省|市|区|县…)`，在真实公告上四处漏电：
 *   - 「撤销杭州市上城区」→ 非贪婪在「市」处收手 → 抓成 `杭州市`（**把杭州市整个撤了**）
 *   - 「撤销横县」→ `{2,15}` 要求词根≥2 字，`横`只有 1 字 → 正则右膨胀成 `横县设立县`
 * 改成贪婪同样死：「撤销横县设立县级横州市」会一路贪成 `横县设立县级横州市`。
 *
 * 正解：名称**不得跨越动词**。用 tempered greedy —— 每个字符都先做否定前瞻，
 * 撞上「撤销/设立/更名/…」就停。于是贪婪变得安全：
 *   撤销|杭州市上城区   ← 贪到底，因为中间没有动词
 *   撤销|横县|设立|县级横州市  ← 在「设」处被动词墙挡下
 *
 * ## 另外三件事
 *   - **枚举展开**：`撤销杭州市上城区、江干区` 是两个实体，不是一个。
 *   - **前缀继承**：枚举第二项起常省略地级前缀（`江干区`），补回 `杭州市江干区` 供解析器消歧。
 *   - **限定词剥离**：`设立新的杭州市上城区` 的实体是上城区，`新的` 是修饰；`县级横州市` 同理。
 */
import type { ChangeIntent } from './types.js';

/** 行政区划单位后缀，用于约束名称右边界 */
const UNIT =
  '(?:省|自治区|市|自治州|地区|盟|区|县|自治县|旗|自治旗|镇|乡|民族乡|街道)';

/**
 * 动词墙：名称内部绝不允许出现的 token。
 * 含动词（撤销/设立/…）与叙述性停用词（以原/所辖/…）——后者用于挡住
 * 「以原凤翔县的行政区域为凤翔区的行政区域」这类**复述**从句被误当作新意图。
 */
const VERB_ALT =
  '撤销|设立|更名|划归|划入|设置|改设|合并|析置|以原|所辖|不含|管辖|驻';

/** tempered greedy 字符：是汉字，且不是动词墙的起点 */
const CHAR = `(?:(?!${VERB_ALT})[\\u4e00-\\u9fa5])`;

/** 名称：贪婪，但被动词墙约束在安全区内。词根允许 1 字（横县、沙县） */
const NAME = `${CHAR}{1,15}${UNIT}`;

/** 名称列表：`A、B、C`（顿号是枚举分隔符，不是名称边界） */
const NAME_LIST = `${NAME}(?:、${NAME})*`;

/**
 * 前置限定词：非名称组成部分，解析前剥离。
 *
 * ⚠️ 只认「新**的**」，绝不剥裸「新」——`新星市`/`新余市`/`新乡市` 的「新」是名字的一部分，
 * 剥了就成了「星市」「余市」「乡市」，全都查无此地。公告里的修饰语恒为「新的」，有「的」兜底。
 */
const QUALIFIER_RE = /^(?:新的|县级|地级|副省级)+/;

/** 可作为地级前缀的单位（用于枚举项的前缀继承） */
const PREFIX_UNIT = '(?:省|自治区|市|自治州|地区|盟)';
const PREFIX_SPLIT_RE = new RegExp(`^(${CHAR}{1,15}${PREFIX_UNIT})(${NAME})$`);

/** 剥离限定词，返回纯名称；剥完为空则返回空串（调用方丢弃） */
function clean(raw: string): string {
  return raw.replace(QUALIFIER_RE, '').trim();
}

/**
 * 展开枚举并继承前缀：
 *   「杭州市上城区、江干区」→ ['杭州市上城区', '杭州市江干区']
 * 首项若形如 <地级前缀><实体>，则把该前缀补给后续的裸项，供解析器按父级消歧
 * （全国重名的「城关镇」「三元区」若不带前缀会命中多候选，只能落人工）。
 */
function expandList(listText: string): string[] {
  const items = listText
    .split('、')
    .map(clean)
    .filter((s) => s.length > 0);
  if (items.length === 0) return [];

  const head = PREFIX_SPLIT_RE.exec(items[0]);
  if (!head) return items; // 首项无地级前缀 → 各项各自独立，不臆造前缀
  const prefix = head[1];

  return items.map((item, i) => {
    if (i === 0) return item;
    // 后续项已自带前缀（`杭州市萧山区`）则不动；裸项（`江干区`）补前缀
    return PREFIX_SPLIT_RE.test(item) ? item : `${prefix}${item}`;
  });
}

/**
 * 文档级上下文：公告标题开头的省/直辖市名。
 *
 * 正文常把行政上下文留在标题里，然后在句子中裸用区名：
 *   「**重庆市**调整江北区、渝北区…行政区划 / 撤销江北区、渝北区，设立两江新区」
 * 「江北区」全国有重庆、宁波两个，裸名必然歧义 → 落人工。但上下文明明就写在标题第一个词。
 * 故抽出它挂到每条 intent 上，解析器在裸名歧义时可用 `<上下文><名称>` 二次消歧。
 *
 * 只认**开头**的省/市/自治区，不在正文里瞎找——正文里的地名是变更对象，不是上下文。
 */
const DOC_CONTEXT_RE = new RegExp(
  `^(${CHAR}{1,15}(?:省|自治区|市))(?=[\\u4e00-\\u9fa5])`
);

function docContext(text: string): string | undefined {
  return DOC_CONTEXT_RE.exec(text.trim())?.[1];
}

/**
 * 从公告文本抽取变更意图。
 *
 * 顺序有意为之：先消费「撤A设B」复合句式，再扫描剩余文本里的单发动词，
 * 避免同一片段被重复计为两条意图。
 */
export function extractIntents(text: string): ChangeIntent[] {
  const intents: ChangeIntent[] = [];
  const seen = new Set<string>();
  const context = docContext(text);
  const push = (it: ChangeIntent, key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    intents.push(context ? { ...it, context } : it);
  };

  // 1) 撤A设B（撤县设区 / 撤县设市 / 区划合并）——两侧都可能是枚举列表：
  //    「撤销杭州市上城区、江干区，设立新的杭州市上城区」
  const cheSheRe = new RegExp(
    `撤销(${NAME_LIST})[，,]?\\s*设立(${NAME_LIST})`,
    'g'
  );
  for (const m of text.matchAll(cheSheRe)) {
    for (const target of expandList(m[1])) {
      push({ kind: 'abolish', target, evidence: m[0] }, `abolish:${target}`);
    }
    for (const name of expandList(m[2])) {
      push({ kind: 'establish', name, evidence: m[0] }, `establish:${name}`);
    }
  }
  // 撤设片段已消费，避免被下方纯撤销/纯设立重复命中
  const rest = text.replace(cheSheRe, ' ');

  // 2) 更名：(将)X更名为Y
  for (const m of rest.matchAll(
    new RegExp(`(?:将)?(${NAME})更名为(${NAME})`, 'g')
  )) {
    const from = clean(m[1]);
    const to = clean(m[2]);
    if (!from || !to) continue;
    push({ kind: 'rename', from, to, evidence: m[0] }, `rename:${from}->${to}`);
  }

  // 3) 纯撤销（含枚举）
  for (const m of rest.matchAll(new RegExp(`撤销(${NAME_LIST})`, 'g'))) {
    for (const target of expandList(m[1])) {
      push({ kind: 'abolish', target, evidence: m[0] }, `abolish:${target}`);
    }
  }

  // 4) 纯设立（含枚举）
  for (const m of rest.matchAll(new RegExp(`设立(${NAME_LIST})`, 'g'))) {
    for (const name of expandList(m[1])) {
      push({ kind: 'establish', name, evidence: m[0] }, `establish:${name}`);
    }
  }

  // 5) 划归/划入：将X划归/划入Y(管辖)
  for (const m of rest.matchAll(
    new RegExp(`将(${NAME})划[归入](${NAME})`, 'g')
  )) {
    const target = clean(m[1]);
    const newParent = clean(m[2]);
    if (!target || !newParent) continue;
    push(
      { kind: 'transfer', target, newParent, evidence: m[0] },
      `transfer:${target}->${newParent}`
    );
  }

  return intents;
}
