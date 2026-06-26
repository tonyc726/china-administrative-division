/**
 * 基线加载：解析 build-source 产出的 divisions CSV 为 Division[]，作为差分基线。
 * CSV 格式固定为 code,"name",level,parent_code,year,status,source_type,confidence_score，
 * 仅 name 字段带引号转义（""→"），无需引入 csv 解析依赖。
 */
import { readFile } from 'fs/promises';
import type { Division, DivisionLevel } from '@cn-division/core';

export function parseDivisionsCsv(content: string): Division[] {
  const out: Division[] = [];
  const lines = content.split('\n');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const firstComma = line.indexOf(',');
    if (firstComma < 0) continue;
    const code = line.slice(0, firstComma);

    let rest = line.slice(firstComma + 1);
    let name: string;
    if (rest.startsWith('"')) {
      let j = 1;
      let buf = '';
      while (j < rest.length) {
        if (rest[j] === '"') {
          if (rest[j + 1] === '"') {
            buf += '"';
            j += 2;
            continue;
          }
          j += 1; // 跨过收尾引号，j 此时指向其后的逗号
          break;
        }
        buf += rest[j];
        j += 1;
      }
      name = buf;
      rest = rest.slice(j + 1); // 跨过逗号
    } else {
      const c = rest.indexOf(',');
      name = rest.slice(0, c);
      rest = rest.slice(c + 1);
    }

    const parts = rest.split(',');
    out.push({
      code,
      name,
      level: Number(parts[0]) as DivisionLevel,
      parent_code: parts[1] || null,
      year: Number(parts[2]),
    });
  }

  return out;
}

export async function loadBaselineCsv(filePath: string): Promise<Division[]> {
  return parseDivisionsCsv(await readFile(filePath, 'utf-8'));
}
