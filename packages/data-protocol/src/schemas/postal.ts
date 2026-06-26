/**
 * Postal Protocol — 邮政编码(邮编) + 长途电话区号(区号) 的独立数据契约。
 *
 * 与区划(divisions)解耦：邮编/区号是近静态的地理参考数据（不随行政区划逐年增改），
 * 故单列 schema，由 @cndiv/source-postal 数据包承载（来源 ip138）。
 */
import { z } from 'zod';

export const PostalRecordSchema = z.object({
  /** 一级行政区名称（如 "北京市" / "广东省"） */
  province: z.string().min(1),
  /** 区县级名称（如 "东城区"） */
  name: z.string().min(1),
  /** 6 位邮政编码 */
  zip_code: z.string().regex(/^\d{6}$/),
  /** 长途区号，0 开头 3–4 位（如 "010" / "0755"） */
  area_code: z.string().regex(/^0\d{2,3}$/),
});

export type PostalRecord = z.infer<typeof PostalRecordSchema>;

/** 校验单条邮编/区号记录；返回 zod SafeParse 结果 */
export function validatePostalRecord(data: unknown): z.SafeParseReturnType<unknown, PostalRecord> {
  return PostalRecordSchema.safeParse(data);
}
