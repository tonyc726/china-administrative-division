/**
 * Validation utilities for Chinese administrative division codes
 */

import { DivisionLevel, DIVISION_LEVEL, PROVINCE_CODES } from './types.js';

/**
 * Validate if a string is a valid 12-digit division code
 *
 * 国家统计局统计用区划代码（12 位）结构：2+2+2+3+3
 * - 2 digits: Province 省
 * - 2 digits: City 市
 * - 2 digits: County 县
 * - 3 digits: Township 乡/镇/街道
 * - 3 digits: Village 村/居委会
 */
export function validateCode(code: string): boolean {
  // Must be exactly 12 digits
  if (!/^\d{12}$/.test(code)) {
    return false;
  }

  // Validate province code
  const provinceCode = code.substring(0, 2);
  if (!(provinceCode in PROVINCE_CODES)) {
    return false;
  }

  return true;
}

/**
 * Get the division level from a 12-digit code
 */
export function getLevelFromCode(code: string): DivisionLevel | null {
  if (!validateCode(code)) {
    return null;
  }

  // 按尾零判级（结构 2+2+2+3+3）：
  //   Province  PP0000000000  (后 10 位为 0)
  //   City      PPCC00000000  (后 8 位为 0)
  //   County    PPCCDD000000  (后 6 位为 0)
  //   Township  PPCCDDTTT000  (后 3 位为 0)
  //   Village   PPCCDDTTTVVV  (无尾零约束)
  if (code.substring(2) === '0000000000') {
    return DIVISION_LEVEL.PROVINCE;
  }
  if (code.substring(4) === '00000000') {
    return DIVISION_LEVEL.CITY;
  }
  if (code.substring(6) === '000000') {
    return DIVISION_LEVEL.COUNTY;
  }
  if (code.substring(9) === '000') {
    return DIVISION_LEVEL.TOWNSHIP;
  }

  return DIVISION_LEVEL.VILLAGE;
}

/**
 * Extract province code (first 2 digits)
 */
export function getProvinceCode(code: string): string | null {
  if (!validateCode(code)) {
    return null;
  }
  return code.substring(0, 2);
}

/**
 * Extract city code (first 4 digits)
 */
export function getCityCode(code: string): string | null {
  if (!validateCode(code)) {
    return null;
  }
  return code.substring(0, 4);
}

/**
 * Extract county code (first 6 digits)
 */
export function getCountyCode(code: string): string | null {
  if (!validateCode(code)) {
    return null;
  }
  return code.substring(0, 6);
}

/**
 * Extract township code (first 9 digits: 2+2+2+3)
 */
export function getTownshipCode(code: string): string | null {
  if (!validateCode(code)) {
    return null;
  }
  return code.substring(0, 9);
}

/**
 * Build parent code from a child code based on level
 */
export function getParentCode(
  code: string,
  childLevel: DivisionLevel
): string | null {
  if (!validateCode(code)) {
    return null;
  }

  switch (childLevel) {
    case DIVISION_LEVEL.CITY:
      return code.substring(0, 2) + '0000000000'; // → province
    case DIVISION_LEVEL.COUNTY:
      return code.substring(0, 4) + '00000000'; // → city
    case DIVISION_LEVEL.TOWNSHIP:
      return code.substring(0, 6) + '000000'; // → county
    case DIVISION_LEVEL.VILLAGE:
      return code.substring(0, 9) + '000'; // → township
    default:
      return null; // PROVINCE 无父级
  }
}

/**
 * Normalize a partial code to full 12 digits
 * Useful for user input like "110101" (county level)
 */
export function normalizeCode(code: string): string | null {
  // Remove any non-digit characters
  const digits = code.replace(/\D/g, '');

  if (digits.length > 12 || digits.length < 2) {
    return null;
  }

  // Pad with zeros to 12 digits
  return digits.padEnd(12, '0');
}
