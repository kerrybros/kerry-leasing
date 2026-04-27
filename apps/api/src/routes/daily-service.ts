/**
 * DAILY SERVICE
 *
 * Downloads the WOLVERINE Daily Service Log .xlsm file from SharePoint via
 * Microsoft Graph (single GET /content call), parses it server-side with
 * exceljs, and serves every visible tab verbatim — including per-cell fill
 * colors, font colors, and bold formatting.
 *
 * Cached in-process for 30 s so concurrent users share one parse.
 */

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { clerkAuthMiddleware, AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { getDriveItemContent } from '../integrations/microsoft/graphClient.js';

const router = Router();

interface CellFormat {
  fill: string | null;
  fontColor: string | null;
  fontBold: boolean;
}

// Merged-cell range, 0-indexed within the tab's `text`/`formats` arrays.
// Inclusive on all four sides — e.g. A1:E1 → { top: 0, left: 0, bottom: 0, right: 4 }.
interface MergeRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface WorkbookTab {
  name: string;
  position: number;
  rowCount: number;
  columnCount: number;
  text: string[][];
  formats: CellFormat[][];
  merges: MergeRange[];
}

interface WorkbookResponse {
  fetchedAt: string;
  tabs: WorkbookTab[];
}

const CACHE_TTL_MS = 30_000;

let cache: { at: number; data: WorkbookResponse } | null = null;

// ---------------------------------------------------------------------------
// Format extraction
// ---------------------------------------------------------------------------

function argbToHex(argb: string | undefined): string | null {
  if (!argb) return null;
  const rgb = argb.length === 8 ? argb.slice(2) : argb;
  return '#' + rgb.toUpperCase();
}

// Default Office theme palette (used when the workbook doesn't customize the
// theme XML — true for the vast majority of files). Indexes match Office's
// theme color order: lt1, dk1, lt2, dk2, accent1..6.
const DEFAULT_THEME_COLORS = [
  '#FFFFFF', '#000000', '#E7E6E6', '#44546A',
  '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000',
  '#4472C4', '#70AD47',
];

function applyTint(rgbHex: string, tint: number): string {
  if (!tint) return rgbHex;
  const hex = rgbHex.replace('#', '');
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);
  if (tint > 0) {
    // Lighten toward white
    r = Math.round(r + (255 - r) * tint);
    g = Math.round(g + (255 - g) * tint);
    b = Math.round(b + (255 - b) * tint);
  } else {
    // Darken toward black
    const factor = 1 + tint;
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
  }
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('')
  );
}

interface ColorLike {
  argb?: string;
  theme?: number;
  tint?: number;
}

function resolveColor(color: ColorLike | undefined | null): string | null {
  if (!color) return null;
  if (color.argb) return argbToHex(color.argb);
  if (typeof color.theme === 'number' && color.theme < DEFAULT_THEME_COLORS.length) {
    const base = DEFAULT_THEME_COLORS[color.theme];
    return applyTint(base, color.tint ?? 0);
  }
  return null;
}

function extractFill(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill;
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') return null;
  const hex = resolveColor(fill.fgColor as ColorLike);
  if (!hex || hex === '#FFFFFF') return null;
  return hex;
}

function extractFontColor(cell: ExcelJS.Cell): string | null {
  const hex = resolveColor(cell.font?.color as ColorLike);
  if (!hex || hex === '#000000') return null;
  return hex;
}

function extractBold(cell: ExcelJS.Cell): boolean {
  // exceljs sometimes surfaces bold via cell.font, sometimes only via the
  // resolved cell.style. Check both.
  if (cell.font?.bold === true) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const styleFont = (cell.style as any)?.font;
  return styleFont?.bold === true;
}

function extractFormat(cell: ExcelJS.Cell): CellFormat {
  return {
    fill: extractFill(cell),
    fontColor: extractFontColor(cell),
    fontBold: extractBold(cell),
  };
}

/**
 * Excel stores dates as UTC-midnight serials. exceljs's `cell.text` getter
 * returns `Date.prototype.toString()` for those — long, ugly, timezone-shifted.
 * Use UTC accessors so a date stored as "4/22/2026" doesn't render as the 21st
 * on Eastern boxes, and keep it short.
 */
function extractCellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value instanceof Date) {
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    const y = value.getUTCFullYear();
    return `${m}/${d}/${y}`;
  }
  return cell.text ?? '';
}

// ---------------------------------------------------------------------------
// Workbook fetch + parse
// ---------------------------------------------------------------------------

async function fetchWorkbook(): Promise<WorkbookResponse> {
  if (!config.microsoftGraph) {
    throw new Error('Microsoft Graph integration is not configured.');
  }
  if (!config.dailyServiceWorkbookItemId) {
    throw new Error('MICROSOFT_GRAPH_DAILY_SERVICE_ITEM_ID is not set.');
  }

  const itemId = config.dailyServiceWorkbookItemId;
  const t0 = Date.now();
  const buffer = await getDriveItemContent(config.microsoftGraph, itemId);
  const tDl = Date.now() - t0;

  const workbook = new ExcelJS.Workbook();
  // exceljs's Buffer typing predates @types/node v20+; cast to any to bridge the gap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const tParse = Date.now() - t0 - tDl;

  const tabs: WorkbookTab[] = [];

  workbook.worksheets.forEach((worksheet, index) => {
    if (worksheet.state !== 'visible') return;
    // Internal source data — never surfaced on the customer page.
    if (worksheet.name.trim() === 'Motive Data') return;

    const rowCount = worksheet.rowCount;
    const initialColCount = worksheet.columnCount;
    const text: string[][] = [];
    const formats: CellFormat[][] = [];

    for (let r = 1; r <= rowCount; r++) {
      const row = worksheet.getRow(r);
      const rowText: string[] = [];
      const rowFormats: CellFormat[] = [];
      for (let c = 1; c <= initialColCount; c++) {
        const cell = row.getCell(c);
        rowText.push(extractCellText(cell));
        rowFormats.push(extractFormat(cell));
      }
      text.push(rowText);
      formats.push(rowFormats);
    }

    // Trim trailing all-empty columns. exceljs's columnCount can over-report
    // when phantom cells were touched once and cleared.
    let lastUsedCol = initialColCount;
    while (lastUsedCol > 0) {
      let anyContent = false;
      for (let r = 0; r < text.length; r++) {
        const v = text[r][lastUsedCol - 1];
        if (v && v.trim() !== '') {
          anyContent = true;
          break;
        }
      }
      if (anyContent) break;
      lastUsedCol--;
    }
    if (lastUsedCol < initialColCount) {
      for (let r = 0; r < text.length; r++) {
        text[r] = text[r].slice(0, lastUsedCol);
        formats[r] = formats[r].slice(0, lastUsedCol);
      }
    }

    // Merged cells: exceljs stores them keyed by the master cell's address
    // (e.g. "A1") with a Range value carrying 1-indexed top/left/bottom/right.
    // Convert to 0-indexed and clip to the trimmed column range.
    const merges: MergeRange[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mergesObj = (worksheet as any)._merges as
      | Record<string, { top: number; left: number; bottom: number; right: number }>
      | undefined;
    if (mergesObj) {
      for (const key of Object.keys(mergesObj)) {
        const m = mergesObj[key];
        const top = m.top - 1;
        const left = m.left - 1;
        if (top >= text.length || left >= lastUsedCol) continue;
        merges.push({
          top,
          left,
          bottom: Math.min(m.bottom - 1, text.length - 1),
          right: Math.min(m.right - 1, lastUsedCol - 1),
        });
      }
    }

    tabs.push({
      name: worksheet.name,
      position: index,
      rowCount,
      columnCount: lastUsedCol,
      text,
      formats,
      merges,
    });
  });

  tabs.sort((a, b) => a.position - b.position);

  console.log(
    `[daily-service] parsed: ${tabs.length} tabs, ${buffer.byteLength} bytes, download=${tDl}ms parse=${tParse}ms`
  );

  return { fetchedAt: new Date().toISOString(), tabs };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

router.get('/workbook', clerkAuthMiddleware, async (_req: AuthRequest, res) => {
  if (!config.microsoftGraph || !config.dailyServiceWorkbookItemId) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Daily service workbook integration is not configured.',
    });
  }

  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return res.json({ ...cache.data, cached: true });
  }

  try {
    const data = await fetchWorkbook();
    cache = { at: now, data };
    res.json({ ...data, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[daily-service] fetch failed:', message);
    res.status(502).json({ error: 'Bad Gateway', message });
  }
});

export default router;
