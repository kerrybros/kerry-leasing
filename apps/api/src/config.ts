import dotenv from 'dotenv';
import { assertCredentialsEncryptionKeyConfigured } from './lib/credentials.js';

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  repairDatabaseUrl: process.env.REPAIR_DATABASE_URL,
  appDatabaseUrl: process.env.APP_DATABASE_URL,
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY!,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
    ],
  },
  cronSecret: process.env.CRON_SECRET,
};

// Validate required env vars
const requiredEnvVars = ['CLERK_SECRET_KEY'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Warn about optional but important env vars
if (!process.env.REPAIR_DATABASE_URL) {
  console.warn('⚠️  REPAIR_DATABASE_URL not set - repair data endpoints will not work');
}

if (!process.env.APP_DATABASE_URL) {
  console.warn('⚠️  APP_DATABASE_URL not set - org mapping features will not work');
  console.warn('   Tenant-scoped endpoints will return 503 until mapping is configured');
}

if (!process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  CRON_SECRET not set - cron endpoints will return 500 when called');
}

if ((process.env.NODE_ENV || 'development') !== 'test') {
  assertCredentialsEncryptionKeyConfigured();
}
