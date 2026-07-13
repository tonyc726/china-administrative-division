/** 预构建静态资产的类型契约（与 scripts/build-data.ts 的产物一一对应） */

export type Kind = '县' | '区' | '市' | '旗' | '其他';

export interface Milestone {
  year: number;
  label: string;
  labelEn: string;
  note: string;
  /** real=真实行政变更；caveat=编码口径变化，必须如实标注，不可当作行政变更叙事 */
  kind: 'real' | 'caveat';
}

export interface Timeline {
  yearMin: number;
  yearMax: number;
  years: number[];
  series: Record<Kind, number[]>;
  provinces: number[];
  milestones: Milestone[];
  headline: {
    countyLost: number;
    districtGained: number;
    cityGained: number;
  };
  source: string;
}

export interface Stats {
  year: number;
  levels: Record<string, number>;
  total: number;
  source: string;
}

/** tree.json：紧凑元组 [code, name, level, parentCode]，L1–L3 */
export type TreeRow = [string, string, number, string];

/** 县级变迁事件：[year, name]，仅变化点（如 [1980,'余姚县'],[1985,'余姚市']） */
export type LineageEvent = [number, string];

/** shards/<county>.json：h=该县 1980–2020 变迁谱系, t=乡镇与村 */
export interface Shard {
  h: LineageEvent[];
  t: [string, string, [string, string][]][];
}

export interface Division {
  code: string;
  name: string;
  level: number;
  parent: string;
}

/** 选中的村（或乡镇）及其完整上级链路 —— 分享卡的数据源 */
export interface Lineage {
  /** 从省到最末级的完整链路 */
  chain: Division[];
  /** 末级单位 */
  leaf: Division;
}
