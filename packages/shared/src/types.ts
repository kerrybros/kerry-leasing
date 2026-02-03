import { z } from 'zod';
import {
  unitSchema,
  repairSchema,
  dailyMetricSchema,
  authInfoSchema,
  healthResponseSchema,
  unitsResponseSchema,
  errorResponseSchema,
} from './schemas';

// Inferred types from schemas
export type Unit = z.infer<typeof unitSchema>;
export type Repair = z.infer<typeof repairSchema>;
export type DailyMetric = z.infer<typeof dailyMetricSchema>;
export type AuthInfo = z.infer<typeof authInfoSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type UnitsResponse = z.infer<typeof unitsResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// User roles
export type UserRole = 'internal' | 'external';

// Auth context
export interface AuthContext {
  userId: string;
  orgId: string | null;
  role: UserRole;
}
