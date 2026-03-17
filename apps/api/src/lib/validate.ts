/**
 * REQUEST VALIDATION + STANDARD ERROR SHAPE
 * Zod schemas for all mutating endpoints and typed query params.
 * Use `parseBody` / `parseQuery` helpers in route handlers.
 *
 * Standard error envelope:
 *   { error: string; message: string; details?: { field: string; message: string }[] }
 */

import { z, ZodSchema } from 'zod';
import { Request, Response } from 'express';

// ─── Standard error helper ────────────────────────────────────────────────────

/**
 * Emit a standardised error response.
 *
 *   sendError(res, 400, 'Validation failed', [{ field: 'date', message: 'required' }])
 *   sendError(res, 500, 'InternalServerError')
 */
export function sendError(
  res: Response,
  status: number,
  error: string,
  message?: string,
  details?: { field: string; message: string }[]
): void {
  const body: Record<string, unknown> = {
    error,
    message: message ?? error,
  };
  if (details && details.length > 0) body.details = details;
  res.status(status).json(body);
}

// ─── Schema Definitions ──────────────────────────────────────────────────────

/** POST /admin/telematics/configure */
export const ConfigureTelematicsSchema = z.object({
  clerkOrgId: z.string().min(1),
  provider: z.enum(['SAMSARA', 'MOTIVE']),
  credentials: z.union([
    z.object({ apiToken: z.string().min(1) }), // Samsara
    z.object({ apiKey: z.string().min(1) }),   // Motive
  ]),
});

/** POST /admin/telematics/vehicle-map */
export const VehicleMapSchema = z.object({
  clerkOrgId: z.string().min(1),
  provider: z.enum(['SAMSARA', 'MOTIVE']),
  providerVehicleId: z.string().min(1),
  vin: z.string().min(1),
  providerVehicleName: z.string().optional(),
});

/** POST /admin/telematics/sync */
export const AdminSyncSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  provider: z.enum(['SAMSARA', 'MOTIVE']).optional(),
});

/** POST /admin/link-org */
export const LinkOrgSchema = z.object({
  clerkOrgId: z.string().min(1),
  customerId: z.string().min(1),
});

/** PUT /admin/repair-customer */
export const RepairCustomerSchema = z.object({
  customerName: z.string().min(1),
  contractStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'contractStartDate must be YYYY-MM-DD'),
});

/** PUT /admin/service-plan/units/:unitId/match */
export const MatchUnitSchema = z.object({
  telematicsVin: z.string().min(1),
});

/** GET /repairs query params */
export const RepairsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
});

/** Generic pagination query params (page + pageSize) */
export const PaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1).default(1)),
  pageSize: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 100))
    .pipe(z.number().int().min(1).max(500).default(100)),
});

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Parse and validate req.body against a Zod schema.
 * Returns the parsed value on success, or sends a 400 response and returns null.
 */
export function parseBody<T>(
  schema: ZodSchema<T>,
  req: Request,
  res: Response
): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}

/**
 * Parse and validate req.query against a Zod schema.
 * Returns the parsed value on success, or sends a 400 response and returns null.
 */
export function parseQuery<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  req: Request,
  res: Response
): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}
