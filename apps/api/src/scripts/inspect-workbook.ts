/**
 * INSPECT WORKBOOK
 *
 * One-off diagnostic: connects to Microsoft Graph, finds Excel files in the
 * configured SharePoint site, and dumps the structure of each tab so we can
 * design the renderer against ground truth.
 *
 * Usage:
 *   pnpm --filter @kerry-leasing/api exec tsx src/scripts/inspect-workbook.ts
 *
 * Optional: pass a workbook name to focus on one file:
 *   pnpm --filter @kerry-leasing/api exec tsx src/scripts/inspect-workbook.ts -- --name="Daily Service.xlsx"
 */

import 'dotenv/config';
import { config } from '../config.js';
import {
  listDriveItems,
  listWorksheets,
  getUsedRange,
  type DriveItem,
} from '../integrations/microsoft/graphClient.js';

function parseArgs(): { nameFilter: string | null; sourceDocFilter: string | null } {
  const args = process.argv.slice(2);
  let nameFilter: string | null = null;
  let sourceDocFilter: string | null = null;
  for (const arg of args) {
    if (arg.startsWith('--name=')) {
      nameFilter = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--sourcedoc=')) {
      sourceDocFilter = arg.split('=').slice(1).join('=').toLowerCase();
    }
  }
  return { nameFilter, sourceDocFilter };
}

async function findXlsxFiles(rootPath: string | null, depth: number): Promise<DriveItem[]> {
  const cfg = config.microsoftGraph!;
  const found: DriveItem[] = [];

  let nextLink: string | null = null;
  do {
    const page = await listDriveItems(cfg, rootPath, nextLink);
    for (const item of page.items) {
      const lower = item.name.toLowerCase();
      const isExcel = lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.xlsb');
      if (!item.isFolder && isExcel) {
        found.push(item);
      } else if (item.isFolder && depth > 0) {
        const sub = await findXlsxFiles(
          rootPath ? `${rootPath}/${item.name}` : item.name,
          depth - 1
        );
        found.push(...sub);
      }
    }
    nextLink = page.nextPage;
  } while (nextLink);

  return found;
}

function summarizeRow(row: string[]): string {
  return row.map((c) => (c.length > 30 ? c.slice(0, 27) + '...' : c)).join(' | ');
}

async function main() {
  if (!config.microsoftGraph) {
    console.error('ERROR: Microsoft Graph not configured. Set MICROSOFT_GRAPH_* env vars in apps/api/.env.');
    process.exit(1);
  }

  const { nameFilter, sourceDocFilter } = parseArgs();

  console.log('Connecting to Graph...');
  console.log(`  Site: ${config.microsoftGraph.siteHostname}${config.microsoftGraph.sitePath}`);
  console.log('');

  console.log('Searching for .xlsx files (root + 3 levels deep)...');
  const xlsxFiles = await findXlsxFiles(null, 3);

  if (xlsxFiles.length === 0) {
    console.error('No .xlsx files found in the site.');
    process.exit(1);
  }

  console.log(`Found ${xlsxFiles.length} Excel file(s):`);
  for (const f of xlsxFiles) {
    const m = /sourcedoc=%7B?([0-9a-fA-F-]+)%7D?/.exec(f.webUrl);
    const srcDoc = m ? m[1].toLowerCase() : '(no sourcedoc)';
    console.log(`  - [${srcDoc}] ${f.name}`);
  }
  console.log('');

  let targets = xlsxFiles;
  if (sourceDocFilter) {
    targets = xlsxFiles.filter((f) => f.webUrl.toLowerCase().includes(sourceDocFilter));
  } else if (nameFilter) {
    targets = xlsxFiles.filter((f) => f.name.toLowerCase().includes(nameFilter.toLowerCase()));
  }

  if (targets.length === 0) {
    console.error(`No file matched filter (name=${nameFilter ?? 'null'}, sourcedoc=${sourceDocFilter ?? 'null'})`);
    process.exit(1);
  }

  for (const file of targets) {
    console.log('='.repeat(80));
    console.log(`WORKBOOK: ${file.name}`);
    console.log(`  ID: ${file.id}`);
    console.log(`  webUrl: ${file.webUrl}`);
    console.log('='.repeat(80));

    let worksheets;
    try {
      worksheets = await listWorksheets(config.microsoftGraph, file.id);
    } catch (err) {
      console.error(`  Failed to list worksheets: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    console.log(`  Tabs (${worksheets.length}):`);
    for (const ws of worksheets) {
      console.log(`    [${ws.position}] "${ws.name}"  (${ws.visibility})`);
    }
    console.log('');

    for (const ws of worksheets) {
      console.log(`--- TAB: "${ws.name}" ---`);
      try {
        const range = await getUsedRange(config.microsoftGraph, file.id, ws.name);
        console.log(`  Address: ${range.address}`);
        console.log(`  Dimensions: ${range.rowCount} rows x ${range.columnCount} cols`);

        if (range.text.length > 0) {
          console.log(`  Row 1 (headers?): ${summarizeRow(range.text[0])}`);
        }
        if (range.text.length > 1) {
          console.log(`  Row 2 (sample):   ${summarizeRow(range.text[1])}`);
        }
        if (range.text.length > 2) {
          console.log(`  Row 3 (sample):   ${summarizeRow(range.text[2])}`);
        }
        if (range.text.length > 3) {
          console.log(`  ... and ${range.text.length - 3} more rows`);
        }
      } catch (err) {
        console.error(`  Failed to read range: ${err instanceof Error ? err.message : String(err)}`);
      }
      console.log('');
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
