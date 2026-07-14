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

/**
 * 某一年的增删。第一项永远是**省码（2 位）** —— 它决定这个名字烧在地图的哪一块上。
 * out = [省, 消失的县, 它变成的名字（'' = 后继不明，绝不编造）]；in = [省, 新写上的县]
 */
export interface YearChange {
  y: number;
  out: [string, string, string][];
  in: [string, string][];
}

/**
 * 省级边界（public/data/geo.json）。r / jd 里的环是**开环**，闭合交给渲染端的 closePath。
 * ⚠️ 第三方数据，带未了结的合规风险 —— 见 apps/web/data/PROVENANCE.md。
 */
export interface Geo {
  /** c=省码2位, n=简称, r=外环（经纬度扁平交错：lon,lat,lon,lat…） */
  provs: { c: string; n: string; r: number[][] }[];
  /** 南海断续线，十段，一段都不能少 */
  jd: number[][];
}

export interface Timeline {
  yearMin: number;
  yearMax: number;
  years: number[];
  series: Record<Kind, number[]>;
  provinces: number[];
  milestones: Milestone[];
  /** 逐年的名册增删 —— 时光机放的就是这个（划掉 826 − 新写 185 = 641，与头条自洽） */
  changes: YearChange[];
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

/** tree.json：紧凑元组 [code, name, level, parentCode, 全拼, 首字母]，L1–L3 */
export type TreeRow = [string, string, number, string, string, string];

/** 县级变迁事件：[year, name]，仅变化点（如 [1980,'余姚县'],[1985,'余姚市']） */
export type LineageEvent = [number, string];

/** 村元组：[村码, 村名, 全国同名村数] —— 第三项即稀有度，随分片下发 */
export type VillageRow = [string, string, number];

/** shards/<county>.json：h=该县 1980–2020 变迁谱系, t=乡镇与村 */
export interface Shard {
  h: LineageEvent[];
  t: [string, string, VillageRow[]][];
}

/** names.json：62 万村名的统计 —— 站点第二、第三个叙事板块的数据源 */
export interface Names {
  totalVillages: number;
  distinct: number;
  uniqueOnes: number;
  /** [名字, 数量, 是否时代词(1/0)]，TOP30 */
  topNames: [string, number, number][];
  era: {
    words: string[];
    total: number;
    rank: [string, number][];
  };
  surnames: {
    total: number;
    /** 全量（几百个姓），降序 —— 用户要查的是自己的姓，不只是榜首 */
    rank: [string, number][];
  };
  marks: {
    north: string[];
    south: string[];
    /** 通名 → 全国总数 + 各省分布（全省份，降序） */
    stats: Record<string, { total: number; provs: [string, number][] }>;
    /** 每省村总数 —— 热力图必须按它归一化，否则读到的是「哪个省村多」 */
    provTotals: Record<string, number>;
  };
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
