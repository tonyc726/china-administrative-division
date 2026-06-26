/**
 * Chinese Administrative Division Types
 *
 * Defines the core data structures for administrative divisions in China.
 * Follows the GB/T 2260 standard for division codes.
 */

/** Division level enumeration */
export const DIVISION_LEVEL = {
  PROVINCE: 1 as const,   // 省/直辖市/自治区/特别行政区
  CITY: 2 as const,       // 地级市/自治州/地区/盟
  COUNTY: 3 as const,     // 市辖区/县级市/县/旗
  TOWNSHIP: 4 as const,   // 镇/乡/街道
  VILLAGE: 5 as const,    // 村/居委会
} as const;

export type DivisionLevel = typeof DIVISION_LEVEL[keyof typeof DIVISION_LEVEL];

/** Division status */
export const DIVISION_STATUS = {
  ACTIVE: 'active' as const,
  DEPRECATED: 'deprecated' as const,
  SUSPENDED: 'suspended' as const,
} as const;

export type DivisionStatus = typeof DIVISION_STATUS[keyof typeof DIVISION_STATUS];

/** Data source type with confidence ranking */
export const SOURCE_TYPE = {
  OFFICIAL_NBS: 'official_nbs' as const,      // 国家统计局官方数据 (最高置信度)
  MCA_DECREE: 'mca_decree' as const,           // 民政部公报 (高置信度)
  COMMUNITY: 'community' as const,             // 社区贡献 (中等置信度)
  SHADOW_MAP: 'shadow_map' as const,           // 商业地图推断 (低置信度)
} as const;

export type SourceType = typeof SOURCE_TYPE[keyof typeof SOURCE_TYPE];

/** Core division interface matching SQLite schema */
export interface Division {
  /** 12-digit GB/T 2260 code */
  code: string;
  /** Division name */
  name: string;
  /** Administrative level (1-5) */
  level: DivisionLevel;
  /** Parent division code (null for province level) */
  parent_code: string | null;
  /** Data year */
  year: number;
  /** Current status */
  status?: DivisionStatus;
  /** Data source */
  source_type?: SourceType;
  /** Confidence score (0-100), 100 = official source */
  confidence_score?: number;
  /** Legacy field: urban-rural classification code (deprecated since 2024) */
  urban_rural_code?: string;
}

/** Province code mapping (first 2 digits) */
export const PROVINCE_CODES: Record<string, string> = {
  '11': '北京市',
  '12': '天津市',
  '13': '河北省',
  '14': '山西省',
  '15': '内蒙古自治区',
  '21': '辽宁省',
  '22': '吉林省',
  '23': '黑龙江省',
  '31': '上海市',
  '32': '江苏省',
  '33': '浙江省',
  '34': '安徽省',
  '35': '福建省',
  '36': '江西省',
  '37': '山东省',
  '41': '河南省',
  '42': '湖北省',
  '43': '湖南省',
  '44': '广东省',
  '45': '广西壮族自治区',
  '46': '海南省',
  '50': '重庆市',
  '51': '四川省',
  '52': '贵州省',
  '53': '云南省',
  '54': '西藏自治区',
  '61': '陕西省',
  '62': '甘肃省',
  '63': '青海省',
  '64': '宁夏回族自治区',
  '65': '新疆维吾尔自治区',
  '71': '台湾省',
  '81': '香港特别行政区',
  '82': '澳门特别行政区',
  '90': '中华人民共和国统计局未收录',
};
