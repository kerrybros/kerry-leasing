'use client';

import { ExternalLink, FileText } from 'lucide-react';

const SHAREPOINT_URL =
  process.env.NEXT_PUBLIC_SHAREPOINT_DOCUMENTS_URL ||
  'https://kerrybros.sharepoint.com/sites/KerryLeasing/Shared%20Documents/Forms/AllItems.aspx';

export default function AdminDocumentsPage() {
  return (
    <div className="mx-auto px-4 py-8 max-w-6xl flex flex-col gap-6">
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
          href={SHAREPOINT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors no-underline shrink-0"
        >
          <ExternalLink className="h-4 w-4" />
          Open in SharePoint
        </a>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card" style={{ minHeight: '70vh' }}>
        <iframe
          src={SHAREPOINT_URL}
          title="SharePoint Documents"
          className="w-full border-0"
          style={{ height: '70vh' }}
          allow="fullscreen"
        />
        <noscript>
          <p className="p-4 text-sm text-muted-foreground">
            Unable to load the embedded view.{' '}
            <a href={SHAREPOINT_URL} target="_blank" rel="noopener noreferrer" className="underline">
              Open in SharePoint
            </a>
          </p>
        </noscript>
      </div>

      <p className="text-xs text-muted-foreground">
        If the view does not load, your browser may need to be signed into Microsoft 365, or your
        tenant may need to allow embedding from this domain.{' '}
        <a href={SHAREPOINT_URL} target="_blank" rel="noopener noreferrer" className="underline">
          Open directly in SharePoint
        </a>
        .
      </p>
    </div>
  );
}
