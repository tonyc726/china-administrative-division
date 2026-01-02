/**
 * Validation utilities for Chinese administrative division codes
 */

import { DivisionLevel, DIVISION_LEVEL, PROVINCE_CODES } from './types.js';

/**
 * Validate if a string is a valid 12-digit division code
 *
 * GB/T 2260 code structure:
 * - 2 digits: Province
 * - 2 digits: City
 * - 2 digits: County
 * - 2 digits: Township
 * - 4 digits: Village
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

  // Check trailing zeros to determine level
  // Village: xxxxxxxxxxxx (no trailing zeros beyond county level)
  // Township: xxxxxx000000 (6 trailing zeros)
  // County: xxxx00000000 (4 trailing zeros)
  // City: xx0000000000 (2 trailing zeros)

  const last6 = code.substring(6);

  if (last6 === '000000') {
    return DIVISION_LEVEL.CITY;
  }

  const last4 = code.substring(8);
  if (last4 === '0000') {
    return DIVISION_LEVEL.COUNTY;
  }

  const last2 = code.substring(10);
  if (last2 === '00') {
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
 * Extract township code (first 8 digits)
 */
export function getTownshipCode(code: string): string | null {
  if (!validateCode(code)) {
    return null;
  }
  return code.substring(0, 8);
}

/**
 * Build parent code from a child code based on level
 */
export function getParentCode(code: string, childLevel: DivisionLevel): string | null {
  if (!validateCode(code)) {
    return null;
  }

  switch (childLevel) {
    case DIVISION_LEVEL.TOWNSHIP:
      return code.substring(0, 6) + '000000';
    case DIVISION_LEVEL.VILLAGE:
      return code.substring(0, 8) + '00';
    default:
      return null;
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
