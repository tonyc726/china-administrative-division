/**
 * 文档首页拆解图轮播的 2023 年村级实码。
 * 名称与父子链由 code-examples.test.ts 对照 packages/source-2023/data/divisions.csv 断言。
 * 直辖市的市级在这份数据里就是「市辖区」占位层；其余五条的市级都是真实地级市。
 */
export const SEGMENT_LENGTHS = [2, 2, 2, 3, 3] as const;

export const RANKS = ['省', '市', '县', '乡', '村'] as const;

export const CITY_PLACEHOLDERS = [
  '市辖区',
  '县',
  '省直辖县级行政区划',
  '省直辖县级行政单位',
  '自治区直辖县级行政区划',
] as const;

export interface CodeSegment {
  digits: string;
  rank: (typeof RANKS)[number];
  name: string;
}

export interface CodeExample {
  code: string;
  region: '东部' | '南部' | '西部' | '北部' | '自治区' | '直辖市';
  segments: readonly CodeSegment[];
}

export const CODE_EXAMPLES: readonly CodeExample[] = [
  {
    code: '330102001051',
    region: '东部',
    segments: [
      { digits: '33', rank: '省', name: '浙江省' },
      { digits: '01', rank: '市', name: '杭州市' },
      { digits: '02', rank: '县', name: '上城区' },
      { digits: '001', rank: '乡', name: '清波街道' },
      { digits: '051', rank: '村', name: '清波门社区' },
    ],
  },
  {
    code: '440307013023',
    region: '南部',
    segments: [
      { digits: '44', rank: '省', name: '广东省' },
      { digits: '03', rank: '市', name: '深圳市' },
      { digits: '07', rank: '县', name: '龙岗区' },
      { digits: '013', rank: '乡', name: '坂田街道' },
      { digits: '023', rank: '村', name: '新雪社区' },
    ],
  },
  {
    code: '511024100033',
    region: '西部',
    segments: [
      { digits: '51', rank: '省', name: '四川省' },
      { digits: '10', rank: '市', name: '内江市' },
      { digits: '24', rank: '县', name: '威远县' },
      { digits: '100', rank: '乡', name: '严陵镇' },
      { digits: '033', rank: '村', name: '古城社区' },
    ],
  },
  {
    code: '230108002003',
    region: '北部',
    segments: [
      { digits: '23', rank: '省', name: '黑龙江省' },
      { digits: '01', rank: '市', name: '哈尔滨市' },
      { digits: '08', rank: '县', name: '平房区' },
      { digits: '002', rank: '乡', name: '保国街道' },
      { digits: '003', rank: '村', name: '东升社区' },
    ],
  },
  {
    code: '540104100205',
    region: '自治区',
    segments: [
      { digits: '54', rank: '省', name: '西藏自治区' },
      { digits: '01', rank: '市', name: '拉萨市' },
      { digits: '04', rank: '县', name: '达孜区' },
      { digits: '100', rank: '乡', name: '德庆镇' },
      { digits: '205', rank: '村', name: '德吉新村' },
    ],
  },
  {
    code: '110101001015',
    region: '直辖市',
    segments: [
      { digits: '11', rank: '省', name: '北京市' },
      { digits: '01', rank: '市', name: '市辖区' },
      { digits: '01', rank: '县', name: '东城区' },
      { digits: '001', rank: '乡', name: '东华门街道' },
      { digits: '015', rank: '村', name: '王府井社区居委会' },
    ],
  },
];

export function examplePhrase(example: CodeExample): string {
  const names = example.segments.map((segment) => segment.name).join('、');
  return `${example.code}，${example.region}，${names}`;
}

export const ROTATE_MS = 3500;
