'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileSpreadsheet, RefreshCw, AlertCircle, Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useApiClient } from '@/hooks/useApiClient';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface CellFormat {
  fill: string | null;
  fontColor: string | null;
  fontBold: boolean;
}

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
  merges?: MergeRange[];
}

// Built once per tab: maps "rowIdx:colIdx" to either the merge master (with
// rowSpan/colSpan to render) or a slave (skipped during rendering).
type MergeCellInfo =
  | { kind: 'master'; rowSpan: number; colSpan: number }
  | { kind: 'slave' };

function buildMergeMap(merges: MergeRange[]): Map<string, MergeCellInfo> {
  const map = new Map<string, MergeCellInfo>();
  for (const m of merges) {
    const rowSpan = m.bottom - m.top + 1;
    const colSpan = m.right - m.left + 1;
    if (rowSpan <= 1 && colSpan <= 1) continue;
    map.set(`${m.top}:${m.left}`, { kind: 'master', rowSpan, colSpan });
    for (let r = m.top; r <= m.bottom; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if (r === m.top && c === m.left) continue;
        map.set(`${r}:${c}`, { kind: 'slave' });
      }
    }
  }
  return map;
}

interface WorkbookResponse {
  fetchedAt: string;
  tabs: WorkbookTab[];
  cached: boolean;
}

const AUTO_REFRESH_MS = 60_000;

function isBlankRow(row: string[]): boolean {
  return row.every((c) => !c || c.trim() === '');
}

// Hard-coded: only the "Completed Units" tab gets the filter input, sticky
// first-row header, and click-to-sort. The rest render verbatim with no extra UI.
const TABS_WITH_FILTER_AND_STICKY = new Set(['Completed Units']);

// The "Out of Service" tab leads — it's the one the service team opens to first.
// Match is normalized (case/spacing/punctuation-insensitive) so a small rename
// in the source workbook won't silently fall back to the old order.
function isOutOfServiceTab(name: string): boolean {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase().includes('outofservice');
}

function orderTabs<T extends { name: string }>(tabs: T[]): T[] {
  const oos = tabs.filter((t) => isOutOfServiceTab(t.name));
  const rest = tabs.filter((t) => !isOutOfServiceTab(t.name));
  return [...oos, ...rest];
}

// Within Completed Units, only these column headers get sort UI.
const SORTABLE_HEADERS = new Set(['Date Out of Service', 'Completion Date']);

interface SortState {
  col: number;
  dir: 'asc' | 'desc';
}

function parseShortDate(s: string): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return Date.UTC(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

function compareCells(a: string, b: string): number {
  const aEmpty = !a || a.trim() === '';
  const bEmpty = !b || b.trim() === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empty cells always sort to the bottom
  if (bEmpty) return -1;

  const dateA = parseShortDate(a);
  const dateB = parseShortDate(b);
  if (dateA !== null && dateB !== null) return dateA - dateB;
  if (dateA !== null) return -1;
  if (dateB !== null) return 1;

  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (!isNaN(numA) && !isNaN(numB) && /^-?\d+(\.\d+)?$/.test(a.trim()) && /^-?\d+(\.\d+)?$/.test(b.trim())) {
    return numA - numB;
  }

  return a.localeCompare(b, undefined, { numeric: true });
}

function SheetTable({
  tab,
  filter,
  setFilter,
  sort,
  setSort,
}: {
  tab: WorkbookTab;
  filter: string;
  setFilter: (v: string) => void;
  sort: SortState | null;
  setSort: (s: SortState | null) => void;
}) {
  const mergeMap = useMemo(
    () => buildMergeMap(tab.merges ?? []),
    [tab.merges]
  );

  if (tab.text.length === 0) {
    return (
      <div className="p-8 text-sm text-muted-foreground text-center">
        This tab is empty.
      </div>
    );
  }

  const enableFilterAndSticky = TABS_WITH_FILTER_AND_STICKY.has(tab.name.trim());
  const filterLower = filter.toLowerCase().trim();
  const filtering = enableFilterAndSticky && filterLower.length > 0;

  const toggleSort = (col: number) => {
    if (!sort || sort.col !== col) {
      setSort({ col, dir: 'asc' });
    } else if (sort.dir === 'asc') {
      setSort({ col, dir: 'desc' });
    } else {
      setSort(null);
    }
  };

  // Build the order in which to render rows. When the tab supports filter/sort,
  // the header (row 0) always sticks at the top, then data rows are filtered
  // and optionally sorted. Other tabs render every row in original order.
  const orderedIndexes: number[] = [];
  if (enableFilterAndSticky) {
    orderedIndexes.push(0); // header
    const dataIndexes: number[] = [];
    for (let i = 1; i < tab.text.length; i++) {
      if (isBlankRow(tab.text[i])) continue;
      if (filtering) {
        const matches = tab.text[i].some((c) => c.toLowerCase().includes(filterLower));
        if (!matches) continue;
      }
      dataIndexes.push(i);
    }
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      dataIndexes.sort(
        (a, b) =>
          dir * compareCells(tab.text[a][sort.col] ?? '', tab.text[b][sort.col] ?? '')
      );
    }
    orderedIndexes.push(...dataIndexes);
  } else {
    for (let i = 0; i < tab.text.length; i++) orderedIndexes.push(i);
  }

  return (
    <div className="flex flex-col h-full">
      {enableFilterAndSticky && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-background flex-shrink-0">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${tab.name.trim()}...`}
            className="text-xs bg-transparent outline-none flex-1 placeholder:text-muted-foreground/70"
          />
          {filtering && (
            <button
              onClick={() => setFilter('')}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="relative w-full flex-1 overflow-auto">
        <table className="text-xs border-collapse w-full">
          <tbody>
            {orderedIndexes.map((rowIdx) => {
              const row = tab.text[rowIdx];
              const blank = isBlankRow(row);
              if (blank) {
                if (filtering || sort) return null;
                return <tr key={rowIdx} className="h-2" />;
              }
              const isHeader = rowIdx === 0;
              return (
                <tr key={rowIdx}>
                  {row.map((cell, colIdx) => {
                    const merge = mergeMap.get(`${rowIdx}:${colIdx}`);
                    if (merge?.kind === 'slave') return null;
                    const isMaster = merge?.kind === 'master';
                    const rowSpan = isMaster ? merge.rowSpan : undefined;
                    const colSpan = isMaster ? merge.colSpan : undefined;
                    const fmt = tab.formats[rowIdx]?.[colIdx];
                    const cellStyle: React.CSSProperties = {};
                    if (fmt?.fill) cellStyle.backgroundColor = fmt.fill;
                    if (fmt?.fontColor) cellStyle.color = fmt.fontColor;
                    if (fmt?.fontBold) cellStyle.fontWeight = 600;
                    if (isMaster) cellStyle.textAlign = 'center';
                    if (enableFilterAndSticky && isHeader) {
                      cellStyle.position = 'sticky';
                      cellStyle.top = 0;
                      cellStyle.zIndex = 1;
                    }
                    const baseClass =
                      'px-3 py-1.5 align-top whitespace-pre-wrap break-words border-r border-b border-border/60';
                    if (enableFilterAndSticky && isHeader) {
                      const isSortable = SORTABLE_HEADERS.has(cell.trim());
                      const isActive = isSortable && sort?.col === colIdx;
                      const headerInteractive =
                        enableFilterAndSticky && isHeader && isSortable
                          ? `${!fmt?.fill ? 'bg-background ' : ''}cursor-pointer select-none hover:bg-muted/40 transition-colors`
                          : enableFilterAndSticky && isHeader && !fmt?.fill
                          ? 'bg-background'
                          : '';
                      return (
                        <td
                          key={colIdx}
                          style={cellStyle}
                          rowSpan={rowSpan}
                          colSpan={colSpan}
                          className={`${baseClass} ${headerInteractive}`}
                          onClick={isSortable ? () => toggleSort(colIdx) : undefined}
                        >
                          {isSortable ? (
                            <span className="inline-flex items-center gap-1">
                              <span>{cell}</span>
                              {isActive ? (
                                sort?.dir === 'asc' ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )
                              ) : (
                                <ChevronsUpDown className="h-3 w-3 opacity-30" />
                              )}
                            </span>
                          ) : (
                            cell
                          )}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={colIdx}
                        style={cellStyle}
                        rowSpan={rowSpan}
                        colSpan={colSpan}
                        className={baseClass}
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DailyServicePage() {
  const { getApi } = useApiClient();
  const [data, setData] = useState<WorkbookResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sorts, setSorts] = useState<Record<string, SortState | null>>({});
  const initialLoadRef = useRef(true);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const api = await getApi();
      const result = await api.get<WorkbookResponse>('/daily-service/workbook');
      setData(result);
      setError(null);
      if (initialLoadRef.current && result.tabs.length > 0) {
        setActiveTab(orderTabs(result.tabs)[0].name);
        initialLoadRef.current = false;
      }
    } catch (err) {
      // On error: keep stale data visible so customers never see a blank page
      const message = err instanceof Error ? err.message : 'Failed to load workbook';
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [getApi]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Initial loading state
  if (!data && !error) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center gap-4 p-8">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground animate-pulse" />
        <div className="text-sm text-muted-foreground">Loading service log...</div>
      </div>
    );
  }

  // Initial error state (no data ever loaded)
  if (!data && error) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center gap-4 p-8">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center max-w-md">
          <h2 className="text-lg font-semibold mb-1">Couldn&apos;t load service log</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Out of Service first; everything else keeps its workbook order.
  const orderedTabs = orderTabs(data.tabs);
  const defaultTabName = orderedTabs[0]?.name;

  return (
    <div className="flex flex-col p-4 pt-6 gap-3" style={{ height: '100vh' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">Wolverine Daily Service Log</h1>
          {error && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Showing cached data — last refresh failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Updated {new Date(data.fetchedAt).toLocaleTimeString()}
          </span>
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 rounded-xl border border-border overflow-hidden">
        <Tabs
          value={activeTab ?? defaultTabName}
          onValueChange={(v) => setActiveTab(v as string)}
          className="h-full flex flex-col gap-0"
        >
          <TabsList className="m-2 self-start gap-1">
            {orderedTabs.map((tab) => {
              const isActive = (activeTab ?? defaultTabName) === tab.name;
              return (
                <TabsTrigger
                  key={tab.name}
                  value={tab.name}
                  className={
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold px-3'
                      : 'text-muted-foreground hover:text-foreground px-3'
                  }
                >
                  {tab.name.trim()}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {orderedTabs.map((tab) => (
            <TabsContent key={tab.name} value={tab.name} className="flex-1 min-h-0 overflow-hidden">
              <SheetTable
                tab={tab}
                filter={filters[tab.name] ?? ''}
                setFilter={(v) => setFilters((prev) => ({ ...prev, [tab.name]: v }))}
                sort={sorts[tab.name] ?? null}
                setSort={(s) => setSorts((prev) => ({ ...prev, [tab.name]: s }))}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
