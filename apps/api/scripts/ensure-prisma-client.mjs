/**
 * Generate the Prisma clients only when they are actually missing.
 *
 * Every cron entry used to run `prisma generate` unconditionally. That was
 * added when a cached turbo build dropped the generated client and the crons
 * died with ERR_MODULE_NOT_FOUND. Turbo now lists `src/generated/**` as a build
 * output, so the client survives the build and the runtime generate is a second
 * safety net doing the same job.
 *
 * It is not free. Generating two schemas needs more memory than a 512Mi cron
 * instance can spare, and on 2026-09-23 and 2026-10-01 the Samsara sync was
 * OOM-killed partway through generating, before its own work had begun.
 *
 * So: check, and generate only if something is genuinely absent. When the build
 * did its job this costs a stat call. When the build did not, the cron still
 * heals itself exactly as before. The log line says which happened, so a build
 * that quietly stops shipping the client shows up as a change in the logs
 * rather than as an out-of-memory kill weeks later.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REQUIRED = ['src/generated/app-client/index.js', 'src/generated/repair-client/index.js'];

const missing = REQUIRED.filter((p) => !existsSync(p));
if (missing.length === 0) {
  console.log('[prisma] generated clients present, skipping generate');
  process.exit(0);
}

console.log(`[prisma] generating: missing ${missing.join(', ')}`);
execSync('pnpm prisma:generate', { stdio: 'inherit' });
