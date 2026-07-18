/**
 * dmfw stname/listPub 地名查询接口类型。
 *
 * 与 crawler 现用的 xzqh/getList（行政区划树，见 dmfw.ts）互补：stname 返回地名记录，
 * 带坐标（CGCS2000）、下探村级。详见 specs/2026-07-18-dmfw-stname-coords-design.md。
 *
 * 接口契约（2026-07-18 浏览器实测确认，非推测）：
 *   POST https://dmfw.mca.gov.cn/stname/listPub  （无 9095 前缀，与 xzqh/getList 同级）
 *   content-type: application/x-www-form-urlencoded
 *   必备 header: User-Agent（否则 WAF 403）、X-Requested-With: XMLHttpRequest、Referer
 *   参数: stName(可空) / placeTypeCode(可空) / code(6位,可空) / page / size(≤100) / year(0=当前) / searchType
 *   响应: { total, records: StnameRow[] }  （字段名是 records 非 rows）
 */

/** stname/listPub 单条地名记录（字段名按 2026-07-18 实测，snake_case） */
export interface StnameRow {
  /** 标准名称（注意字段名是 standard_name，非 name） */
  standard_name: string;
  /** 地名类型码：21610(行政村)/21620(社区)/27610(村民委员会)/27620(社区居委会) */
  place_type_code: string;
  /**
   * 几何：multipoint，coordinates 为 [[lon, lat], ...]（嵌套数组，取 [0] 得单点）。
   * CGCS2000 体系（站点底图天地图，无 GCJ-02 偏移）。采样缺失率 0%。
   */
  gdm: { type: string; coordinates: number[][] } | null;
  /** 边界面，恒为 null（只有点、无多边形） */
  pdm: unknown;
  /** 20 位地名库 place_code -- 弃用，不进产物（衍生数据集论证，见规格 §11） */
  place_code?: string;
  /** 罗马字母（带声调），白送字段 */
  roman_alphabet_spelling?: string;
  /** 少数民族文字，白送字段 */
  ethnic_minorities_writing?: string;
  /** 所属省/市/县名（可用于 join 时的上级链校验） */
  province_name?: string;
  city_name?: string;
  area_name?: string;
  /** 9 位乡级码（6 位县级 + 3 位乡级，可用于 join 乡级） */
  area?: string;
}

/** stname/listPub 分页响应（字段名 records，2026-07-18 实测） */
export interface StnameResponse {
  /** 命中总数（用于翻页与抖动 total=0 判定） */
  total: number;
  /** 当页记录（注意是 records 非 rows） */
  records: StnameRow[];
}

/**
 * 保留的地名类型码：21610(行政村) + 21620(社区)。
 *
 * 排除 27610(村民委员会)/27620(社区居委会)--它们与 21xxx 是同一实体的双重登记
 * （21xxx=行政区域类，27xxx=单位法人类），四者相加会算出 161% 假覆盖率。
 * 实测同名记录坐标距离中位数 0m。详见规格 §4。
 */
export const KEEP_TYPES: ReadonlySet<string> = new Set(['21610', '21620']);

/** stname 抓取失败（带 code + placeTypeCode 上下文），供上层部分容错 */
export class StnameError extends Error {
  constructor(
    public readonly code: string,
    public readonly placeTypeCode: string,
    message: string
  ) {
    super(
      `stname/listPub failed for code="${code}" type="${placeTypeCode}": ${message}`
    );
    this.name = 'StnameError';
  }
}
