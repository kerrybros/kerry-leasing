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
    // Comma-separated on server (e.g. Render). Values must match the browser `Origin` (scheme + host, no path).
    allowedOrigins: (() => {
      const fromEnv = process.env.ALLOWED_ORIGINS?.split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      if (fromEnv?.length) return fromEnv;
      return [
        'http://localhost:3000',
        'https://www.kerryleasing.com',
        'https://kerryleasing.com',
      ];
    })(),
  },
  cronSecret: process.env.CRON_SECRET,
  redisUrl: process.env.REDIS_URL ?? null,
  microsoftGraph: process.env.MICROSOFT_GRAPH_TENANT_ID
    ? {
        tenantId: process.env.MICROSOFT_GRAPH_TENANT_ID,
        clientId: process.env.MICROSOFT_GRAPH_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET!,
        siteHostname: process.env.MICROSOFT_GRAPH_SITE_HOSTNAME!,
        sitePath: process.env.MICROSOFT_GRAPH_SITE_PATH!,
      }
    : null,
  dailyServiceWorkbookItemId: process.env.MICROSOFT_GRAPH_DAILY_SERVICE_ITEM_ID ?? null,
  twilio: process.env.TWILIO_ACCOUNT_SID
    ? {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
        statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL ?? null,
      }
    : null,
  // When true, the SMS pipeline writes DriverWeeklyReportSent rows but never calls Twilio.
  // Auto-true when twilio config is missing OR TWILIO_DRY_RUN=true is set explicitly.
  smsDryRun: process.env.TWILIO_DRY_RUN === 'true' || !process.env.TWILIO_ACCOUNT_SID,
  reportPublicBaseUrl:
    process.env.REPORT_PUBLIC_BASE_URL ?? 'https://www.kerryleasing.com',
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
