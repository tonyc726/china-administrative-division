/**
 * Patch Protocol Schema Definitions
 *
 * Defines the JSON Schema for community patches and data validation.
 * Uses Zod for runtime validation.
 */

import { z } from 'zod';
// 复用 @cndiv/core 的领域枚举作为唯一真相源（不再硬编码字面量）
import { DIVISION_LEVEL, DIVISION_STATUS, SOURCE_TYPE } from '@cndiv/core';

/** Evidence confidence levels */
export const CONFIDENCE_LEVELS = {
  HIGH: 'high' as const,      // Official government source
  MEDIUM: 'medium' as const,  // News report or official announcement
  LOW: 'low' as const,        // Community submission or inferred
} as const;

/** Patch metadata */
export const PatchMetaSchema = z.object({
  /** Patch author (GitHub username or ID) */
  author: z.string().min(1).max(100),
  /** Source URL for evidence */
  source_url: z.string().url().optional(),
  /** Evidence confidence level */
  evidence_confidence: z.nativeEnum(CONFIDENCE_LEVELS).default('medium'),
  /** Baseline version this patch applies to */
  apply_after: z.string().default('2023-baseline'),
  /** Timestamp of patch creation */
  created_at: z.string().datetime().optional(),
  /** Additional notes */
  notes: z.string().optional(),
});

/** Patch operation types */
export const PATCH_OPERATION = {
  ADD: 'add' as const,
  REMOVE: 'remove' as const,
  UPDATE: 'update' as const,
  MOVE: 'move' as const,
} as const;

/** Add operation */
export const AddOperationSchema = z.object({
  op: z.literal(PATCH_OPERATION.ADD),
  code: z.string().length(12),
  name: z.string().min(1).max(100),
  level: z.nativeEnum(DIVISION_LEVEL),
  parent_code: z.string().length(12).nullable(),
  /** Override default source_type */
  source_type: z.nativeEnum(SOURCE_TYPE).optional(),
  /** Override default confidence_score */
  confidence_score: z.number().min(0).max(100).optional(),
});

/** Remove operation */
export const RemoveOperationSchema = z.object({
  op: z.literal(PATCH_OPERATION.REMOVE),
  code: z.string().length(12),
  /** Reason for removal */
  reason: z.string().optional(),
});

/** Update operation */
export const UpdateOperationSchema = z.object({
  op: z.literal(PATCH_OPERATION.UPDATE),
  code: z.string().length(12),
  /** New name (if renaming) */
  name: z.string().min(1).max(100).optional(),
  /** New status */
  status: z.nativeEnum(DIVISION_STATUS).optional(),
  /** New parent code (for boundary changes) */
  new_parent: z.string().length(12).optional(),
  /** Update notes */
  note: z.string().optional(),
});

/** Move operation (change parent) */
export const MoveOperationSchema = z.object({
  op: z.literal(PATCH_OPERATION.MOVE),
  code: z.string().length(12),
  new_parent: z.string().length(12),
});

/** Union of all operation types */
export const OperationSchema = z.union([
  AddOperationSchema,
  RemoveOperationSchema,
  UpdateOperationSchema,
  MoveOperationSchema,
]);

export type Operation = z.infer<typeof OperationSchema>;

/** Complete patch file structure */
export const PatchSchema = z.object({
  meta: PatchMetaSchema,
  operations: z.array(OperationSchema).min(1),
});

export type Patch = z.infer<typeof PatchSchema>;

/** Validate a patch file */
export function validatePatch(data: unknown): { success: true; data: Patch } | { success: false; error: string } {
  const result = PatchSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
