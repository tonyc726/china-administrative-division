/**
 * ip138 省级邮编/区号页面解析器（纯函数，便于夹具测试）。
 *
 * 现网结构（2024 改版后，UTF-8）：省页含一张表头为「区县 | 邮政编码 | 电话区号」的表，
 * 为节省纵向空间每个 <tr> 横向并排多组 (区县, 邮编, 区号)。故按 td 文本每 3 列一组解析，
 * 用 6 位邮编 + 0 开头区号正则过滤掉表头/空格/合并单元格等噪声。
 *
 * 注：legacy 的 GB2312 + `#quanguo`/`.mod-panel` 解析对应旧版页面，现网已失效，此处按现网重写。
 */
import { load } from 'cheerio';
import type { PostalRecord } from '@cndiv/data-protocol';

const ZIP_RE = /^\d{6}$/;
const AREA_RE = /^0\d{2,3}$/;

/**
 * 解析某省页 HTML → PostalRecord[]。province 为该省名称（用于回填记录）。
 */
export function parseProvincePostal(html: string, province: string): PostalRecord[] {
  const $ = load(html);
  const records: PostalRecord[] = [];

  $('table').each((_, table) => {
    const headers = $(table)
      .find('th')
      .map((_, th) => $(th).text().trim())
      .get();
    if (!headers.includes('邮政编码')) return; // 只处理邮编表

    $(table)
      .find('tr')
      .each((_, tr) => {
        const tds = $(tr)
          .find('td')
          .map((_, td) => $(td).text().trim())
          .get();
        // 每行可能横排多组 (区县, 邮编, 区号)
        for (let i = 0; i + 2 < tds.length; i += 3) {
          const name = tds[i];
          const zip = tds[i + 1];
          const area = tds[i + 2];
          if (name && ZIP_RE.test(zip) && AREA_RE.test(area)) {
            records.push({ province, name, zip_code: zip, area_code: area });
          }
        }
      });
  });

  return records;
}
