/**
 * @cndiv/core 示例：12 位区划码工具（纯函数、零依赖、不碰数据库）。
 * 运行：npx tsx packages/core/examples/code-tools.ts
 */
import {
  validateCode,
  normalizeCode,
  getLevelFromCode,
  getProvinceCode,
  getCityCode,
  getCountyCode,
  getTownshipCode,
  getParentCode,
  PROVINCE_CODES,
} from '@cndiv/core';

// 1) 校验：仅结构(^\d{12}$) + 前 2 位省码白名单，不保证该码真实存在
console.log('validateCode 110101000000 =', validateCode('110101000000')); // true
console.log('validateCode 990101000000 =', validateCode('990101000000')); // false（99 非法省码）
console.log('validateCode 11010100000  =', validateCode('11010100000')); // false（11 位）

// 2) 归一化用户输入到 12 位（补零）。注意：不校验省码，需再过一遍 validateCode
const full = normalizeCode('110101'); // '110101000000'
console.log('normalizeCode 110101 =', full, '→ valid?', full && validateCode(full));

// 3) 判级（尾零启发式）+ 逐级前缀码
const code = '110101001001'; // 东华门街道下某居委会
console.log('getLevelFromCode  =', getLevelFromCode(code)); // 5 (VILLAGE)
console.log('getProvinceCode   =', getProvinceCode(code)); // '11'
console.log('getCityCode       =', getCityCode(code)); // '1101'
console.log('getCountyCode     =', getCountyCode(code)); // '110101'
console.log('getTownshipCode   =', getTownshipCode(code)); // '110101001'（9 位，非 8）

// 4) 构造父码：getParentCode 需先知道「传入码自身的层级」（不自动判级）
const county = '110101000000';
const lvl = getLevelFromCode(county); // 3 (COUNTY)
if (lvl !== null) {
  console.log('getParentCode     =', getParentCode(county, lvl)); // '110100000000'（市辖区占位层）
}

// 5) 库内唯一「码→名」能力，且仅省级
const pcode = getProvinceCode(code);
console.log('省名（仅省级可查）=', pcode ? PROVINCE_CODES[pcode] : null); // '北京市'
