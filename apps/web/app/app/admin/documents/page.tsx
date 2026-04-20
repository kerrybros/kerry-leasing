'use client';

import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, FileText, Folder, File, ChevronRight, Home, ArrowLeft, AlertCircle, Loader2, X } from 'lucide-react';
import { useApiClient } from '@/hooks/useApiClient';
import { Button } from '@/components/ui/button';

const SHAREPOINT_LIBRARY_URL =
  process.env.NEXT_PUBLIC_SHAREPOINT_DOCUMENTS_URL ||
  'https://kerrybros.sharepoint.com/sites/KerryLeasing/Shared%20Documents/Forms/AllItems.aspx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size: number | null;
  lastModifiedDateTime: string | null;
  isFolder: boolean;
}

interface DriveItemsResponse {
  items: DriveItem[];
  nextPage: string | null;
  path: string;
  driveWebUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Build breadcrumb segments from a path string like "Contracts/2025"
function pathSegments(path: string): { label: string; path: string }[] {
  if (!path) return [];
  const parts = path.split('/').filter(Boolean);
  return parts.map((label, i) => ({
    label,
    path: parts.slice(0, i + 1).join('/'),
  }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminDocumentsPage() {
  const { getApi } = useApiClient();

  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<DriveItem[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [driveWebUrl, setDriveWebUrl] = useState<string>(SHAREPOINT_LIBRARY_URL);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview modal state
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [previewEmbedUrl, setPreviewEmbedUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fetchItems = useCallback(
    async (path: string, next: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      setError(null);

      try {
        const api = await getApi();
        const params = new URLSearchParams();
        if (path) params.set('path', path);
        if (next) params.set('next', next);
        const qs = params.toString();
        const data = await api.get<DriveItemsResponse>(
          `/admin/sharepoint/drive-items${qs ? `?${qs}` : ''}`
        );

        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setNextPage(data.nextPage);
        if (data.driveWebUrl) setDriveWebUrl(data.driveWebUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getApi]
  );

  // Fetch when path changes
  useEffect(() => {
    setItems([]);
    setNextPage(null);
    fetchItems(currentPath, null, false);
  }, [currentPath, fetchItems]);

  const navigate = (path: string) => setCurrentPath(path);

  const openPreview = useCallback(async (item: DriveItem) => {
    setPreviewItem(item);
    setPreviewEmbedUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const api = await getApi();
      const data = await api.get<{ embedUrl: string }>(`/admin/sharepoint/preview/${item.id}`);
      setPreviewEmbedUrl(data.embedUrl);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [getApi]);

  const closePreview = () => {
    setPreviewItem(null);
    setPreviewEmbedUrl(null);
    setPreviewError(null);
  };

  const segments = pathSegments(currentPath);
  const parentPath = segments.length > 1
    ? segments.slice(0, -1).map((s) => s.label).join('/')
    : '';

  // Fallback URL: use driveWebUrl when inside a folder so the "open" button is relevant
  const openInSharePointUrl = currentPath
    ? items.find((i) => !i.isFolder)?.webUrl?.split('/').slice(0, -1).join('/') || driveWebUrl
    : driveWebUrl;

  return (
    <div className="mx-auto px-4 py-8 max-w-6xl flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-1">Documents</h1>
            <p className="text-sm text-muted-foreground">
              Contract, Exhibit B, and other customer documents stored in SharePoint.
            </p>
          </div>
        </div>
        <a
          href={SHAREPOINT_LIBRARY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors no-underline shrink-0"
        >
          <ExternalLink className="h-4 w-4" />
          Open in SharePoint
        </a>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button
          onClick={() => navigate('')}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Documents</span>
        </button>
        {segments.map((seg) => (
          <span key={seg.path} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
            <button
              onClick={() => navigate(seg.path)}
              className={`hover:text-foreground transition-colors ${
                seg.path === currentPath ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {seg.label}
            </button>
          </span>
        ))}
      </div>

      {/* Back button when inside a folder */}
      {currentPath && (
        <button
          onClick={() => navigate(parentPath)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {/* Content */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading documents…</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 px-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive/70" />
            <div>
              <p className="font-medium text-foreground">Could not load documents</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => fetchItems(currentPath, null, false)}>
                Retry
              </Button>
              <a
                href={SHAREPOINT_LIBRARY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors no-underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in SharePoint
              </a>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Folder className="w-10 h-10 opacity-40" />
            <p className="text-sm">This folder is empty.</p>
          </div>
        )}

        {/* File table */}
        {!loading && !error && items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground w-full">Name</th>
                <th className="py-2.5 px-4 text-right font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">Size</th>
                <th className="py-2.5 px-4 text-right font-medium text-muted-foreground whitespace-nowrap hidden md:table-cell">Modified</th>
                <th className="py-2.5 px-4 text-right font-medium text-muted-foreground whitespace-nowrap">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={item.isFolder ? 'hover:bg-muted/50 cursor-pointer' : 'hover:bg-muted/30'}
                  onClick={item.isFolder ? () => navigate(currentPath ? `${currentPath}/${item.name}` : item.name) : undefined}
                >
                  {/* Name */}
                  <td className="py-2.5 px-4">
                    <span className="flex items-center gap-2.5">
                      {item.isFolder
                        ? <Folder className="w-4 h-4 text-primary/70 shrink-0" />
                        : <File className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <span className={`truncate ${item.isFolder ? 'font-medium' : ''}`}>
                        {item.name}
                      </span>
                    </span>
                  </td>

                  {/* Size */}
                  <td className="py-2.5 px-4 text-right text-muted-foreground tabular-nums whitespace-nowrap hidden sm:table-cell">
                    {item.isFolder ? '—' : formatSize(item.size)}
                  </td>

                  {/* Modified */}
                  <td className="py-2.5 px-4 text-right text-muted-foreground whitespace-nowrap hidden md:table-cell">
                    {formatDate(item.lastModifiedDateTime)}
                  </td>

                  {/* Open/Preview — files only */}
                  <td className="py-2.5 px-4 text-right">
                    {item.isFolder ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                    ) : (
                      <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openPreview(item)}
                          className="text-primary hover:underline text-sm whitespace-nowrap"
                        >
                          Preview
                        </button>
                        <a
                          href={item.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Open in SharePoint"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Load more */}
        {nextPage && !loading && !error && (
          <div className="flex justify-center py-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => fetchItems(currentPath, nextPage, true)}
            >
              {loadingMore ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading…</>
              ) : (
                'Load more'
              )}
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Files open in SharePoint using your Microsoft 365 credentials. Access is controlled by your
        SharePoint permissions.{' '}
        <a href={SHAREPOINT_LIBRARY_URL} target="_blank" rel="noopener noreferrer" className="underline">
          Open library directly in SharePoint.
        </a>
      </p>

      {/* Preview modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closePreview}
        >
          <div
            className="relative flex flex-col bg-background rounded-xl shadow-2xl w-full max-w-5xl"
            style={{ height: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <File className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{previewItem.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewItem.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in SharePoint
                </a>
                <button
                  onClick={closePreview}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 min-h-0">
              {previewLoading && (
                <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading preview…</span>
                </div>
              )}
              {!previewLoading && previewError && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <AlertCircle className="w-8 h-8 text-destructive/70" />
                  <p className="text-sm font-medium">Preview unavailable</p>
                  <p className="text-xs text-muted-foreground max-w-sm">{previewError}</p>
                  <a
                    href={previewItem.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline no-underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in SharePoint instead
                  </a>
                </div>
              )}
              {!previewLoading && previewEmbedUrl && (
                <iframe
                  src={previewEmbedUrl}
                  className="w-full h-full rounded-b-xl border-0"
                  title={previewItem.name}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
