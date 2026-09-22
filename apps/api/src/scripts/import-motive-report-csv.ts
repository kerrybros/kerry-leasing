/**
 * Manual import of Driver Fuel Performance CSV exports (history backfill).
 *
 * Files must be named <anything>_<YYYY-MM-DD>_<YYYY-MM-DD>.csv; the two dates
 * are the inclusive window the export covers (as chosen in the Motive date
 * filter). Weekly files should be Monday..Sunday to line up with the scorecard.
 *
 *   pnpm exec tsx src/scripts/import-motive-report-csv.ts --org=<clerkOrgId> --file=path.csv
 *   pnpm exec tsx src/scripts/import-motive-report-csv.ts --org=<clerkOrgId> --dir=tmp/motive-report
 *   add --force to re-import a file already ingested (rows are upserted).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAppPrisma } from '../lib/prisma.js';
import { MotiveReportSource } from '../generated/app-client/index.js';
import { parseDriverFuelPerformanceCsv } from '../features/motiveReport/parseDriverFuelPerformanceCsv.js';
import { windowFromFilename } from '../features/motiveReport/reportWindow.js';
import { storeReport } from '../features/motiveReport/reportStore.js';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main() {
  const org = arg('org');
  const file = arg('file');
  const dir = arg('dir');
  const force = process.argv.includes('--force');
  if (!org || (!file && !dir)) throw new Error('--org=<clerkOrgId> and --file= or --dir= required');

  const files = file
    ? [file]
    : fs.readdirSync(dir!).filter((f) => /\.csv$/i.test(f)).map((f) => path.join(dir!, f)).sort();

  const prisma = getAppPrisma();
  let ok = 0, skipped = 0, failed = 0;
  for (const f of files) {
    const window = windowFromFilename(f);
    if (!window) { console.log(`SKIP  ${f}: filename lacks _YYYY-MM-DD_YYYY-MM-DD.csv window`); skipped++; continue; }
    const sourceRef = `file:${path.basename(f)}`;
    try {
      if (force) {
        await prisma.motiveReportIngest.deleteMany({ where: { sourceRef } }); // cascades to rows
      }
      const text = fs.readFileSync(f, 'utf8');
      const parsed = parseDriverFuelPerformanceCsv(text);
      const r = await storeReport({
        clerkOrgId: org,
        source: MotiveReportSource.MANUAL_IMPORT,
        sourceRef,
        reportName: 'Driver Fuel Performance (manual export)',
        attachmentName: path.basename(f),
        window,
        rawCsv: text,
        rows: parsed.rows,
      });
      const tag = r.alreadyIngested ? 'DUP ' : 'OK  ';
      console.log(`${tag}  ${window.windowStart}..${window.windowEnd} ${window.granularity.padEnd(6)} rows=${r.rowCount} matched=${r.matchedDrivers}${r.unmatchedDriverNames.length ? ` UNMATCHED: ${r.unmatchedDriverNames.join('; ')}` : ''}  ${path.basename(f)}`);
      if (r.alreadyIngested) skipped++; else ok++;
    } catch (e: any) {
      console.log(`FAIL  ${f}: ${e.message}`); failed++;
    }
  }
  console.log(`\nimported=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
