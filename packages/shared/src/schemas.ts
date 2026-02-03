import { z } from 'zod';

// Unit schema
export const unitSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  vin: z.string(),
  unitNumber: z.string(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).default('active'),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

// Repair schema
export const repairSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  unitId: z.string(),
  vin: z.string(),
  description: z.string(),
  cost: z.number().optional(),
  date: z.date().or(z.string()),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

// Daily metric schema
export const dailyMetricSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  vin: z.string(),
  date: z.date().or(z.string()),
  milesDriven: z.number().optional(),
  idleMinutes: z.number().optional(),
  avgMpg: z.number().optional(),
  createdAt: z.date().or(z.string()),
});

// API response schemas
export const authInfoSchema = z.object({
  userId: z.string(),
  orgId: z.string().nullable(),
  role: z.enum(['internal', 'external']).default('external'),
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  timestamp: z.string().optional(),
});

export const unitsResponseSchema = z.object({
  units: z.array(unitSchema),
  count: z.number(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});
