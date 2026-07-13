/** 预构建静态资产的类型契约（与 scripts/build-data.ts 的产物一一对应） */

export type Kind = '县' | '区' | '市' | '旗' | '其他';

export interface Milestone {
  year: number;
  label: string;
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

/** shards/<county>.json：[乡镇码, 乡镇名, [[村码, 村名], ...]] */
export type Shard = [string, string, [string, string][]][];

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
